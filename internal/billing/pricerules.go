package billing

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/modelsphere/console/internal/gatewayapi"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/retry"
)

var PriceRulesGVR = gatewayapi.PriceRules

type PriceRule struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              Price            `json:"spec"`
	Status            PriceObservation `json:"status,omitempty"`
}

type PriceObservation struct {
	Version    string       `json:"observedVersion,omitempty"`
	ObservedAt *metav1.Time `json:"observedAt,omitempty"`
	Error      string       `json:"error,omitempty"`
}

type PriceArchive interface {
	SavePrice(context.Context, Price) error
}

type PriceCache struct {
	archive   PriceArchive
	client    dynamic.Interface
	namespace string
	informer  cache.SharedIndexInformer
	log       *slog.Logger
	// mu guards observed prices and every version waiting for durable archival.
	mu      sync.RWMutex
	prices  map[string]Price
	pending map[string]Price
}

func NewPriceCache(ctx context.Context, client dynamic.Interface, namespace string, archive PriceArchive, log *slog.Logger) (*PriceCache, error) {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, namespace, nil)
	prices := &PriceCache{archive: archive, client: client, namespace: namespace, informer: factory.ForResource(PriceRulesGVR).Informer(), log: log, prices: map[string]Price{}, pending: map[string]Price{}}
	_, err := prices.informer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: prices.observe, UpdateFunc: func(_, updated any) { prices.observe(updated) }, DeleteFunc: prices.remove})
	if err != nil {
		return nil, err
	}
	factory.Start(ctx.Done())
	syncContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if !cache.WaitForCacheSync(syncContext.Done(), prices.informer.HasSynced) {
		return nil, fmt.Errorf("sync PriceRule informer: %w", syncContext.Err())
	}
	go prices.run(ctx)
	return prices, nil
}

func (prices *PriceCache) Get(model string) (Price, bool) {
	prices.mu.RLock()
	defer prices.mu.RUnlock()
	price, found := prices.prices[model]
	return price, found
}

func (prices *PriceCache) observe(value any) {
	object, ok := value.(*unstructured.Unstructured)
	if !ok {
		return
	}
	var rule PriceRule
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &rule); err != nil {
		prices.log.Error("decode price rule failed", "rule", object.GetName(), "err", err)
		return
	}
	if rule.Spec.RuleID != object.GetNamespace()+"/"+object.GetName() || object.GetName() != priceRuleName(rule.Spec.Model) {
		prices.log.Error("price rule identity does not match metadata", "rule", object.GetName())
		return
	}
	if err := rule.Spec.Validate(); err != nil {
		prices.log.Error("invalid price rule", "rule", object.GetName(), "err", err)
		return
	}
	prices.mu.Lock()
	if active, ok := prices.prices[rule.Spec.Model]; ok && active != rule.Spec {
		delete(prices.prices, rule.Spec.Model)
	}
	prices.pending[rule.Spec.RuleID+"\x00"+rule.Spec.Version] = rule.Spec
	prices.mu.Unlock()
}

func (prices *PriceCache) remove(value any) {
	if tombstone, ok := value.(cache.DeletedFinalStateUnknown); ok {
		value = tombstone.Obj
	}
	object, ok := value.(*unstructured.Unstructured)
	if !ok {
		return
	}
	model, _, err := unstructured.NestedString(object.Object, "spec", "model")
	if err != nil {
		return
	}
	prices.mu.Lock()
	delete(prices.prices, model)
	prices.mu.Unlock()
}

func (prices *PriceCache) run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		prices.flush(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (prices *PriceCache) flush(ctx context.Context) {
	prices.mu.RLock()
	pending := make(map[string]Price, len(prices.pending))
	for key, price := range prices.pending {
		pending[key] = price
	}
	prices.mu.RUnlock()
	for key, price := range pending {
		if err := prices.archive.SavePrice(ctx, price); err != nil {
			prices.log.Error("archive observed price failed", "rule", price.RuleID, "version", price.Version, "err", err)
			if statusErr := prices.markStatus(ctx, price, "archival failed; inspect worker logs"); statusErr != nil {
				prices.log.Warn("price error status deferred", "err", statusErr)
			}
			continue
		}
		current, exists, err := prices.informer.GetStore().GetByKey(price.RuleID)
		if err != nil || !exists {
			continue
		}
		object := current.(*unstructured.Unstructured)
		spec, _, err := unstructured.NestedMap(object.Object, "spec")
		var currentPrice Price
		if err == nil {
			err = runtime.DefaultUnstructuredConverter.FromUnstructured(spec, &currentPrice)
		}
		if err != nil {
			continue
		}
		prices.mu.Lock()
		if prices.pending[key] == price {
			delete(prices.pending, key)
		}
		if currentPrice == price {
			prices.prices[price.Model] = price
		}
		prices.mu.Unlock()
		if currentPrice == price {
			if err := prices.markStatus(ctx, price, ""); err != nil {
				prices.log.Warn("price observation status deferred", "rule", price.RuleID, "err", err)
			}
		}
	}
}

func (prices *PriceCache) markStatus(ctx context.Context, price Price, message string) error {
	resource := prices.client.Resource(PriceRulesGVR).Namespace(prices.namespace)
	_, name, _ := strings.Cut(price.RuleID, "/")
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		object, err := resource.Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}
		spec, _, err := unstructured.NestedMap(object.Object, "spec")
		if err != nil {
			return err
		}
		var current Price
		if err := runtime.DefaultUnstructuredConverter.FromUnstructured(spec, &current); err != nil {
			return err
		}
		if current != price {
			return nil
		}
		observed, _, err := unstructured.NestedString(object.Object, "status", "observedVersion")
		if err != nil {
			return err
		}
		previousError, _, err := unstructured.NestedString(object.Object, "status", "error")
		if err != nil {
			return err
		}
		if ((message == "" && observed == price.Version) || message != "") && previousError == message {
			return nil
		}
		status := map[string]any{"error": message}
		if message == "" {
			status["observedVersion"] = price.Version
			status["observedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		}
		if err := unstructured.SetNestedMap(object.Object, status, "status"); err != nil {
			return err
		}
		_, err = resource.UpdateStatus(ctx, object, metav1.UpdateOptions{})
		return err
	})
}
