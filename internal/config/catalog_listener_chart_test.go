package config

import (
	"io"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestHelmCatalogHasOnlyAnInternalService(t *testing.T) {
	for _, serviceType := range []string{"NodePort", "LoadBalancer"} {
		args := []string{"--set", "externalSwiss.url=http://swiss.swiss.svc/api", "--set", "service.type=" + serviceType}
		out, err := helmTemplate(t, args...)
		if err != nil {
			t.Fatalf("render %v %s", err, out)
		}
		dec := yaml.NewDecoder(strings.NewReader(out))
		catalogs, main, catalogPorts := 0, 0, 0
		for {
			var doc struct {
				Kind     string `yaml:"kind"`
				Metadata struct {
					Name string `yaml:"name"`
				} `yaml:"metadata"`
				Spec struct {
					Type  string `yaml:"type"`
					Ports []struct {
						Name       string `yaml:"name"`
						Port       int    `yaml:"port"`
						TargetPort string `yaml:"targetPort"`
						NodePort   int    `yaml:"nodePort"`
					} `yaml:"ports"`
					Template struct {
						Spec struct {
							Containers []struct {
								Ports []struct {
									Name          string `yaml:"name"`
									ContainerPort int    `yaml:"containerPort"`
								} `yaml:"ports"`
							} `yaml:"containers"`
						} `yaml:"spec"`
					} `yaml:"template"`
				} `yaml:"spec"`
			}
			err := dec.Decode(&doc)
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
			if doc.Kind == "Service" {
				if doc.Metadata.Name == "console-console-catalog" {
					catalogs++
					if doc.Spec.Type != "ClusterIP" || len(doc.Spec.Ports) != 1 || doc.Spec.Ports[0].Port != 8081 || doc.Spec.Ports[0].TargetPort != "catalog" || doc.Spec.Ports[0].NodePort != 0 {
						t.Fatalf("catalog service exposed externally: %+v", doc)
					}
				} else {
					for _, port := range doc.Spec.Ports {
						if port.Name == "catalog" || port.TargetPort == "catalog" {
							t.Fatalf("catalog leaked into service %s", doc.Metadata.Name)
						}
					}
				}
				if doc.Metadata.Name == "console-console" {
					main++
					if doc.Spec.Type != serviceType || len(doc.Spec.Ports) != 1 || doc.Spec.Ports[0].TargetPort != "http" {
						t.Fatalf("main service changed: %+v", doc)
					}
				}
			}
			if doc.Kind == "Deployment" && doc.Metadata.Name == "console-console" {
				for _, container := range doc.Spec.Template.Spec.Containers {
					for _, port := range container.Ports {
						if port.Name == "catalog" {
							catalogPorts++
							if port.ContainerPort != 8081 {
								t.Fatalf("catalog container port=%d", port.ContainerPort)
							}
						}
					}
				}
			}
		}
		if catalogs != 1 || main != 1 || catalogPorts != 1 {
			t.Fatalf("services catalog=%d main=%d container=%d", catalogs, main, catalogPorts)
		}
	}
	off, err := helmTemplate(t, "--set", "externalSwiss.url=http://swiss.swiss.svc/api", "--set", "modelTemplates.enabled=false")
	if err != nil {
		t.Fatalf("render %v %s", err, off)
	}
	if strings.Contains(off, "name: console-console-catalog") || strings.Contains(off, "name: catalog") {
		t.Fatal("disabled templates exposed an internal listener/service")
	}
	c := renderChartConfig(t, "--set", "externalSwiss.url=http://swiss.swiss.svc/api", "--set", "modelTemplates.port=8082")
	if c.Server.CatalogAddr != ":8082" || c.ModelTemplates.PublishURL != "http://console-console-catalog.modelsphere.svc:8082/catalog/console" {
		t.Fatalf("custom catalog port mismatch=%+v %+v", c.Server, c.ModelTemplates)
	}
}
