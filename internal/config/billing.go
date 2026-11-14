package config

import (
	"fmt"
	"path/filepath"
	"time"
)

type Billing struct {
	Enabled            bool                  `yaml:"enabled,omitempty"`
	Role               string                `yaml:"role,omitempty"`
	Currency           string                `yaml:"currency,omitempty"`
	AdmissionThreshold int64                 `yaml:"admissionThreshold,omitempty"`
	Store              BillingStore          `yaml:"store,omitempty"`
	Queue              BillingQueue          `yaml:"queue,omitempty"`
	Journal            BillingJournal        `yaml:"journal,omitempty"`
	Usage              BillingUsage          `yaml:"usage,omitempty"`
	Settlement         BillingSettlement     `yaml:"settlement,omitempty"`
	Reconciliation     BillingReconciliation `yaml:"reconciliation,omitempty"`
}

type BillingStore struct {
	Driver         string `yaml:"driver,omitempty"`
	DSNEnv         string `yaml:"dsnEnv,omitempty"`
	SQLitePath     string `yaml:"sqlitePath,omitempty"`
	MaxConnections int    `yaml:"maxConnections,omitempty"`
}

type BillingQueue struct {
	URLEnv        string        `yaml:"urlEnv,omitempty"`
	Prefix        string        `yaml:"prefix,omitempty"`
	Partitions    int           `yaml:"partitions,omitempty"`
	LeaseDuration time.Duration `yaml:"leaseDuration,omitempty"`
}

type BillingJournal struct {
	ReplayRetained bool          `yaml:"replayRetained,omitempty"`
	Directory      string        `yaml:"directory,omitempty"`
	ShardIDEnv     string        `yaml:"shardIDEnv,omitempty"`
	SegmentBytes   int64         `yaml:"segmentBytes,omitempty"`
	MaxBytes       int64         `yaml:"maxBytes,omitempty"`
	MinFreeBytes   uint64        `yaml:"minFreeBytes,omitempty"`
	Retention      time.Duration `yaml:"retention,omitempty"`
	SyncMode       string        `yaml:"syncMode,omitempty"`
	SyncInterval   time.Duration `yaml:"syncInterval,omitempty"`
	FailurePolicy  string        `yaml:"failurePolicy,omitempty"`
	ReplayInterval time.Duration `yaml:"replayInterval,omitempty"`
	ReplayRate     int           `yaml:"replayRate,omitempty"`
}

type BillingUsage struct {
	FlushInterval time.Duration `yaml:"flushInterval,omitempty"`
	PollInterval  time.Duration `yaml:"pollInterval,omitempty"`
	MaxEvents     int64         `yaml:"maxEvents,omitempty"`
	MaxBytes      int           `yaml:"maxBytes,omitempty"`
	Concurrency   int           `yaml:"concurrency,omitempty"`
}

type BillingSettlement struct {
	Interval      time.Duration `yaml:"interval,omitempty"`
	MaxWallets    int           `yaml:"maxWallets,omitempty"`
	MaxCharges    int           `yaml:"maxCharges,omitempty"`
	LeaseName     string        `yaml:"leaseName,omitempty"`
	LeaseDuration time.Duration `yaml:"leaseDuration,omitempty"`
	RenewDeadline time.Duration `yaml:"renewDeadline,omitempty"`
	RetryPeriod   time.Duration `yaml:"retryPeriod,omitempty"`
}

type BillingReconciliation struct {
	URL      string `yaml:"url,omitempty"`
	Upstream string `yaml:"upstream,omitempty"`
	TokenEnv string `yaml:"tokenEnv,omitempty"`
}

func (configuration *Billing) applyDefaults() {
	if configuration.Role == "" {
		configuration.Role = "gateway"
	}
	if !configuration.Enabled {
		return
	}
	if configuration.Currency == "" {
		configuration.Currency = "USD"
	}
	configuration.storeDefaults()
	configuration.queueDefaults()
	configuration.journalDefaults()
	configuration.workerDefaults()
}

func (configuration *Billing) storeDefaults() {
	if configuration.Store.Driver == "" {
		configuration.Store.Driver = "postgres"
	}
	if configuration.Store.DSNEnv == "" {
		configuration.Store.DSNEnv = "CONSOLE_BILLING_DSN"
	}
	if configuration.Store.MaxConnections == 0 {
		configuration.Store.MaxConnections = 20
	}
}

func (configuration *Billing) queueDefaults() {
	if configuration.Queue.URLEnv == "" {
		configuration.Queue.URLEnv = "CONSOLE_BILLING_REDIS_URL"
	}
	if configuration.Queue.Prefix == "" {
		configuration.Queue.Prefix = "modelsphere:billing"
	}
	if configuration.Queue.Partitions == 0 {
		configuration.Queue.Partitions = 8
	}
	if configuration.Queue.LeaseDuration == 0 {
		configuration.Queue.LeaseDuration = 30 * time.Second
	}
}

func (configuration *Billing) journalDefaults() {
	journal := &configuration.Journal
	if journal.ShardIDEnv == "" {
		journal.ShardIDEnv = "CONSOLE_JOURNAL_SHARD"
	}
	if journal.SegmentBytes == 0 {
		journal.SegmentBytes = 16 << 20
	}
	if journal.MaxBytes == 0 {
		journal.MaxBytes = 1 << 30
	}
	if journal.Retention == 0 {
		journal.Retention = 24 * time.Hour
	}
	if journal.SyncMode == "" {
		journal.SyncMode = "record"
	}
	if journal.SyncInterval == 0 {
		journal.SyncInterval = 100 * time.Millisecond
	}
	if journal.FailurePolicy == "" {
		journal.FailurePolicy = "continue"
	}
	if journal.ReplayInterval == 0 {
		journal.ReplayInterval = time.Second
	}
	if journal.ReplayRate == 0 {
		journal.ReplayRate = 1000
	}
}

func (configuration *Billing) workerDefaults() {
	usage := &configuration.Usage
	if usage.FlushInterval == 0 {
		usage.FlushInterval = 5 * time.Second
	}
	if usage.PollInterval == 0 {
		usage.PollInterval = 100 * time.Millisecond
	}
	if usage.MaxEvents == 0 {
		usage.MaxEvents = 500
	}
	if usage.MaxBytes == 0 {
		usage.MaxBytes = 4 << 20
	}
	if usage.Concurrency == 0 {
		usage.Concurrency = 4
	}
	settlement := &configuration.Settlement
	if settlement.Interval == 0 {
		settlement.Interval = 10 * time.Second
	}
	if settlement.MaxWallets == 0 {
		settlement.MaxWallets = 100
	}
	if settlement.MaxCharges == 0 {
		settlement.MaxCharges = 1000
	}
	if settlement.LeaseName == "" {
		settlement.LeaseName = "console-billing-settlement"
	}
	if settlement.LeaseDuration == 0 {
		settlement.LeaseDuration = 30 * time.Second
	}
	if settlement.RenewDeadline == 0 {
		settlement.RenewDeadline = 20 * time.Second
	}
	if settlement.RetryPeriod == 0 {
		settlement.RetryPeriod = 5 * time.Second
	}
}

func (configuration Billing) validate(router Router) error {
	if !configuration.Enabled {
		return nil
	}
	if router.KeySource != "crd" || router.Namespace == "" {
		return fmt.Errorf("billing requires router.keySource crd and router.namespace")
	}
	if configuration.Role != "gateway" && configuration.Role != "usage" && configuration.Role != "settlement" && configuration.Role != "replay" {
		return fmt.Errorf("billing.role must be gateway, usage, settlement or replay")
	}
	if len(configuration.Currency) != 3 {
		return fmt.Errorf("billing.currency must be a three-letter code")
	}
	for _, character := range configuration.Currency {
		if character < 'A' || character > 'Z' {
			return fmt.Errorf("billing.currency must be uppercase ASCII")
		}
	}
	if configuration.Store.Driver != "postgres" && configuration.Store.Driver != "sqlite" {
		return fmt.Errorf("billing.store.driver must be postgres or sqlite")
	}
	if configuration.Store.Driver == "sqlite" && !filepath.IsAbs(configuration.Store.SQLitePath) {
		return fmt.Errorf("billing.store.sqlitePath must be absolute")
	}
	if configuration.Store.MaxConnections < 1 {
		return fmt.Errorf("billing.store.maxConnections must be positive")
	}
	if configuration.Queue.Partitions < 1 || configuration.Queue.LeaseDuration < time.Second {
		return fmt.Errorf("invalid billing queue partitions or lease")
	}
	if err := configuration.validateJournal(); err != nil {
		return err
	}
	return configuration.validateWorkers()
}

func (configuration Billing) validateJournal() error {
	journal := configuration.Journal
	if journal.ReplayRetained && configuration.Role != "replay" {
		return fmt.Errorf("billing.journal.replayRetained requires the replay role")
	}
	if (configuration.Role == "gateway" || configuration.Role == "replay") && !filepath.IsAbs(journal.Directory) {
		return fmt.Errorf("billing.journal.directory must be an absolute persistent path")
	}
	if journal.SegmentBytes < 1 || journal.MaxBytes < 2*journal.SegmentBytes || journal.Retention < 0 {
		return fmt.Errorf("invalid billing journal capacity or retention")
	}
	if journal.SyncMode != "record" && journal.SyncMode != "interval" {
		return fmt.Errorf("billing.journal.syncMode must be record or interval")
	}
	if journal.SyncInterval <= 0 || journal.ReplayInterval <= 0 || journal.ReplayRate < 1 || journal.ReplayRate > 1000000 {
		return fmt.Errorf("invalid billing journal timing or replay rate")
	}
	if journal.FailurePolicy != "continue" && journal.FailurePolicy != "reject_new" {
		return fmt.Errorf("billing.journal.failurePolicy must be continue or reject_new")
	}
	return nil
}

func (configuration Billing) validateWorkers() error {
	usage, settlement := configuration.Usage, configuration.Settlement
	if usage.FlushInterval <= 0 || usage.PollInterval <= 0 || usage.MaxEvents < 1 || usage.MaxBytes < 1 || usage.Concurrency < 1 {
		return fmt.Errorf("invalid billing usage batch configuration")
	}
	if settlement.Interval <= 0 || settlement.MaxWallets < 1 || settlement.MaxCharges < 1 || settlement.LeaseName == "" {
		return fmt.Errorf("invalid billing settlement batch configuration")
	}
	if settlement.LeaseDuration <= settlement.RenewDeadline || settlement.RenewDeadline <= settlement.RetryPeriod || settlement.RetryPeriod <= 0 {
		return fmt.Errorf("billing settlement requires leaseDuration > renewDeadline > retryPeriod > 0")
	}
	return nil
}
