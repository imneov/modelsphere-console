package config

import (
	"slices"
	"testing"
)

func TestRouterPipelineFailoverStatusDefaultsAndValidation(t *testing.T) {
	// Left out of the file, the defaults apply.
	var unset RouterPipeline
	if err := unset.validate(); err != nil {
		t.Fatal(err)
	}
	if defaults := unset.WithDefaults(); !slices.Equal(defaults.FailoverStatuses, []int{429, 500, 502, 503, 504}) {
		t.Fatalf("default failover statuses: %v", defaults.FailoverStatuses)
	}
	// An explicit empty list disables status failover while retries stay possible.
	if configured := (RouterPipeline{FailoverStatuses: []int{}}).WithDefaults(); len(configured.FailoverStatuses) != 0 {
		t.Fatalf("explicit empty failover statuses: %v", configured.FailoverStatuses)
	}
	if err := (RouterPipeline{FailoverStatuses: []int{99}}).validate(); err == nil {
		t.Fatal("out-of-range failover status was accepted")
	}
}
