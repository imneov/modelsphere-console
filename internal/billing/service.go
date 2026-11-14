package billing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/modelsphere/console/internal/gatewayapi"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/util/retry"
)

type BillingStore interface {
	ProjectionStore
	Credit(context.Context, Credit) (Wallet, error)
	Wallet(context.Context, string, string) (Wallet, error)
	Reconcile(context.Context, string) (Wallet, error)
	RebuildWallet(context.Context, string) (Wallet, error)
	Requests(context.Context, Filter) (Page[Request], error)
	Ledger(context.Context, Filter) (Page[LedgerEntry], error)
	SavePrice(context.Context, Price) error
	PriceHistory(context.Context, Filter) (Page[Price], error)
	Ingest(context.Context, []Event, PriceLookup) error
	AcquireFence(context.Context, string) (int64, error)
	Settle(context.Context, int64, int, int) (int, error)
}

type Verification struct {
	Usage      Usage
	TerminalAt time.Time
}

type UsageVerifier interface {
	Verify(context.Context, Request) (Verification, error)
}

type Service struct {
	Registry  prometheus.Gatherer
	Metrics   *Telemetry
	Store     BillingStore
	Meter     *Meter
	Queue     EventQueue
	Client    dynamic.Interface
	Namespace string
	Currency  string
	Verifier  UsageVerifier
}

func (service *Service) PublishPrice(ctx context.Context, price Price) error {
	if price.Currency != service.Currency {
		return errors.New("price currency differs from configured wallet currency")
	}
	name := priceRuleName(price.Model)
	price.RuleID = service.Namespace + "/" + name
	if err := price.Validate(); err != nil {
		return err
	}
	// Archive before publishing so rapid updates retain even unobserved intermediate versions.
	if err := service.Store.SavePrice(ctx, price); err != nil {
		return err
	}
	resource := service.Client.Resource(gatewayapi.PriceRules).Namespace(service.Namespace)
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		object, err := resource.Get(ctx, name, metav1.GetOptions{})
		create := apierrors.IsNotFound(err)
		if err != nil && !create {
			return err
		}
		if create {
			object = &unstructured.Unstructured{Object: map[string]any{"apiVersion": gatewayapi.Group + "/" + gatewayapi.Version, "kind": "PriceRule", "metadata": map[string]any{"name": name, "namespace": service.Namespace}}}
		}
		spec, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&price)
		if err != nil {
			return err
		}
		if err := unstructured.SetNestedMap(object.Object, spec, "spec"); err != nil {
			return err
		}
		if create {
			_, err = resource.Create(ctx, object, metav1.CreateOptions{})
		} else {
			_, err = resource.Update(ctx, object, metav1.UpdateOptions{})
		}
		return err
	})
}

func (service *Service) Prices(ctx context.Context) ([]PriceRule, error) {
	objects, err := service.Client.Resource(gatewayapi.PriceRules).Namespace(service.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	rules := make([]PriceRule, 0, len(objects.Items))
	for _, object := range objects.Items {
		var rule PriceRule
		if err := runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &rule); err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func (service *Service) Supplement(ctx context.Context, request Request) error {
	if request.Usage.Complete {
		return nil
	}
	if service.Verifier == nil {
		return errors.New("trusted upstream usage reconciliation is not configured")
	}
	proof, err := service.Verifier.Verify(ctx, request)
	if err != nil {
		return err
	}
	usage := proof.Usage
	if err := usage.Validate(); err != nil {
		return err
	}
	if !usage.Complete {
		return errors.New("upstream cannot verify complete usage")
	}
	hash, _, err := fingerprint(usage)
	if err != nil {
		return err
	}
	if service.Meter == nil {
		return errors.New("metering journal is unavailable")
	}
	event := Event{SchemaVersion: 1, EventID: "supplement/" + request.RequestID + "/" + hash, Type: "usage_supplement", RequestID: request.RequestID, OwnerUID: request.OwnerUID, WalletID: request.WalletID, APIKeyID: request.APIKeyID, IdentitySource: request.IdentitySource, Model: request.Model, Upstream: request.Upstream, AttemptID: request.AttemptID, UpstreamRequestID: request.UpstreamRequestID, OccurredAt: proof.TerminalAt, Usage: usage}
	// A deterministic ID also needs a stable payload timestamp across repeated recovery attempts.
	if request.TerminalAt != nil {
		event.OccurredAt = *request.TerminalAt
	} else if proof.TerminalAt.IsZero() || (request.StartedAt != nil && proof.TerminalAt.Before(*request.StartedAt)) || proof.TerminalAt.After(time.Now()) {
		return errors.New("upstream proof needs a valid terminal timestamp for start-only recovery")
	}
	return service.Meter.record(ctx, event)
}

func resourceDigest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func priceRuleName(model string) string { return "price-" + resourceDigest(model)[:40] }
