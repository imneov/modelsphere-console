package cluster

import (
	"encoding/base64"
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
)

func unstructuredOf(apiVersion, kind, namespace, name string, data map[string]any) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": apiVersion,
		"kind":       kind,
		"metadata":   map[string]any{"name": name, "namespace": namespace},
		"data":       data,
	}}
}

func TestConfigMapAndSecret(t *testing.T) {
	k := NewKubeFrom(fake.NewSimpleDynamicClient(runtime.NewScheme(),
		unstructuredOf("v1", "ConfigMap", "llm", "site-profile", map[string]any{"profile.yaml": "name: llm\n"}),
		// A ConfigMap the API server would never store: data is strings, so an
		// object that says otherwise is broken rather than partly usable.
		unstructuredOf("v1", "ConfigMap", "llm", "odd", map[string]any{"nested": map[string]any{"x": "y"}}),
		// A Secret's data is base64 on the wire, and console wants the bytes.
		unstructuredOf("v1", "Secret", "llm", "keys", map[string]any{
			"keys": base64.StdEncoding.EncodeToString([]byte("k1:alice")),
		}),
		unstructuredOf("v1", "Secret", "llm", "broken", map[string]any{"keys": "not base64!"}),
	))

	cm, err := k.ConfigMap(t.Context(), "llm", "site-profile")
	if err != nil {
		t.Fatal(err)
	}
	if cm["profile.yaml"] != "name: llm\n" {
		t.Fatalf("configmap = %+v", cm)
	}
	if _, err := k.ConfigMap(t.Context(), "llm", "absent"); err == nil {
		t.Fatal("a missing ConfigMap read as present")
	}
	if _, err := k.ConfigMap(t.Context(), "llm", "odd"); err == nil {
		t.Fatal("a ConfigMap with non-string data read as present")
	}

	secret, err := k.Secret(t.Context(), "llm", "keys")
	if err != nil {
		t.Fatal(err)
	}
	if string(secret["keys"]) != "k1:alice" {
		t.Fatalf("secret = %+v", secret)
	}

	// A Secret that is not base64 is a broken object, and saying so beats
	// handing the gateway a credential made of someone else's encoding.
	if _, err := k.Secret(t.Context(), "llm", "broken"); err == nil || !strings.Contains(err.Error(), "not base64") {
		t.Fatalf("err = %v", err)
	}
}
