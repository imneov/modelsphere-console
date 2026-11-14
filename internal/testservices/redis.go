package testservices

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisService struct {
	URL        string
	executable string
	socket     string
	process    *exec.Cmd
	cancel     context.CancelFunc
}

func RedisURL(test *testing.T) string {
	test.Helper()
	if configured := os.Getenv("BILLING_TEST_REDIS_URL"); configured != "" {
		return configured
	}
	return NewRedisService(test).URL
}

func NewRedisService(test *testing.T) *RedisService {
	test.Helper()
	executable, err := exec.LookPath("redis-server")
	if err != nil {
		test.Skip("redis-server is not installed")
	}
	directory, err := os.MkdirTemp("", "billing-redis-")
	if err != nil {
		test.Fatal(err)
	}
	test.Cleanup(func() {
		if err := os.RemoveAll(directory); err != nil {
			test.Error(err)
		}
	})
	socket := filepath.Join(directory, "redis.sock")
	service := &RedisService{URL: "unix://" + socket, executable: executable, socket: socket}
	test.Cleanup(func() { service.Stop(test) })
	service.Start(test)
	return service
}

func (service *RedisService) Start(test *testing.T) {
	test.Helper()
	if service.process != nil {
		test.Fatal("Redis fixture is already running")
	}
	ctx, cancel := context.WithCancel(test.Context())
	process := exec.CommandContext(ctx, service.executable, "--port", "0", "--unixsocket", service.socket, "--save", "", "--appendonly", "no", "--loglevel", "warning")
	process.Env = append(os.Environ(), "LC_ALL=C", "LANG=C")
	if err := process.Start(); err != nil {
		cancel()
		test.Fatal(err)
	}
	service.process, service.cancel = process, cancel
	options, err := redis.ParseURL(service.URL)
	if err != nil {
		test.Fatal(err)
	}
	client := redis.NewClient(options)
	defer client.Close()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if client.Ping(test.Context()).Err() == nil {
			return
		}
		if time.Now().After(deadline) {
			test.Fatal("Redis test server did not become ready")
		}
		time.Sleep(time.Millisecond)
	}
}

func (service *RedisService) Stop(test *testing.T) {
	test.Helper()
	if service.process == nil {
		return
	}
	service.cancel()
	err := service.process.Wait()
	var exited *exec.ExitError
	if err != nil && !errors.As(err, &exited) {
		test.Error(err)
	}
	service.process = nil
}
