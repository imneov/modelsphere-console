package config

import (
	"os"
	"path/filepath"
	"testing"

	apiextensions "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	"k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/validation"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/yaml"
)

func TestBillingCRDsPassKubernetesSchemaAndCELValidation(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("..", "..", "helm", "console", "crds", "gateway.modelsphere.io_*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 3 {
		t.Fatalf("expected Key, PriceRule and WalletAdmission definitions, got %d", len(paths))
	}
	scheme := runtime.NewScheme()
	if err := apiextensions.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := apiextensionsv1.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var definition apiextensionsv1.CustomResourceDefinition
			if err := yaml.UnmarshalStrict(content, &definition); err != nil {
				t.Fatal(err)
			}
			scheme.Default(&definition)
			// The API server initializes storedVersions as part of create admission.
			definition.Status.StoredVersions = []string{"v1alpha1"}
			var internal apiextensions.CustomResourceDefinition
			if err := scheme.Convert(&definition, &internal, nil); err != nil {
				t.Fatal(err)
			}
			if problems := validation.ValidateCustomResourceDefinition(t.Context(), &internal); len(problems) > 0 {
				t.Fatal(problems.ToAggregate())
			}
		})
	}
}
