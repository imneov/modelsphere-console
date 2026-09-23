// Package cluster is consoled's access to Kubernetes, where the iam CRDs
// (User, IAMRole, IAMRoleBinding under iam.theriseunion.io) live.
//
// It uses the dynamic client rather than a typed clientset: the iam types are
// CRDs, and a dynamic client reads and writes them as unstructured objects
// without registering a scheme or generating clients -- enough for the CRUD the
// portal needs, and one less code-generation step to keep in sync with Global.
package cluster

import (
	"fmt"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type Kube struct {
	dyn dynamic.Interface
}

// NewKube builds a client. An empty kubeconfig means in-cluster first, then the
// usual loading rules -- the same fallback swissd uses.
func NewKube(kubeconfig, context_ string) (*Kube, error) {
	cfg, err := restConfig(kubeconfig, context_)
	if err != nil {
		return nil, err
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("dynamic client: %w", err)
	}
	return &Kube{dyn: dyn}, nil
}

// Dynamic exposes the dynamic client for the iam store to build resource
// clients against the iam.theriseunion.io GroupVersionResources.
func (k *Kube) Dynamic() dynamic.Interface { return k.dyn }

func restConfig(kubeconfig, context_ string) (*rest.Config, error) {
	if kubeconfig == "" && context_ == "" {
		if cfg, err := rest.InClusterConfig(); err == nil {
			return cfg, nil
		}
	}
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfig != "" {
		rules.ExplicitPath = kubeconfig
	}
	overrides := &clientcmd.ConfigOverrides{}
	if context_ != "" {
		overrides.CurrentContext = context_
	}
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, overrides).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("kubeconfig: %w", err)
	}
	return cfg, nil
}
