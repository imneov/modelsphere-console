package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type RedisOptions struct {
	Metrics       *Telemetry
	URL           string
	Prefix        string
	Partitions    int
	Group         string
	LeaseDuration time.Duration
}

type RedisQueue struct {
	client  *redis.Client
	options RedisOptions
	// mu guards lazy initialization and the next partition to inspect.
	mu    sync.Mutex
	ready bool
	next  int
}

func NewRedisQueue(options RedisOptions) (*RedisQueue, error) {
	if options.Partitions < 1 || options.Prefix == "" || options.Group == "" || options.LeaseDuration < time.Second {
		return nil, errors.New("invalid Redis queue partition, group or lease configuration")
	}
	connection, err := redis.ParseURL(options.URL)
	if err != nil {
		return nil, errors.New("invalid Redis queue URL")
	}
	connection.ContextTimeoutEnabled = true
	connection.DialTimeout = time.Second
	connection.ReadTimeout = time.Second * 2
	connection.WriteTimeout = time.Second * 2
	return &RedisQueue{client: redis.NewClient(connection), options: options}, nil
}

func (queue *RedisQueue) initialize(ctx context.Context) error {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	if queue.ready {
		return nil
	}
	key := queue.options.Prefix + ":partitions"
	if err := queue.client.SetNX(ctx, key, queue.options.Partitions, 0).Err(); err != nil {
		return err
	}
	partitions, err := queue.client.Get(ctx, key).Int()
	if err != nil {
		return err
	}
	if partitions != queue.options.Partitions {
		return fmt.Errorf("queue partitions are immutable: stored %d, configured %d", partitions, queue.options.Partitions)
	}
	for partition := 0; partition < partitions; partition++ {
		err := queue.client.XGroupCreateMkStream(ctx, queue.stream(partition), queue.options.Group, "0").Err()
		if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
			return err
		}
	}
	queue.ready = true
	return nil
}

func (queue *RedisQueue) stream(partition int) string {
	return fmt.Sprintf("%s:events:%d", queue.options.Prefix, partition)
}
func (queue *RedisQueue) lease(partition int) string   { return queue.stream(partition) + ":owner" }
func (queue *RedisQueue) Close() error                 { return queue.client.Close() }
func (queue *RedisQueue) LeaseDuration() time.Duration { return queue.options.LeaseDuration }

func (queue *RedisQueue) Publish(ctx context.Context, event Event) (result error) {
	started := time.Now()
	defer func() { queue.options.Metrics.observe("queue_publish", started, result) }()
	if err := event.Validate(); err != nil {
		return err
	}
	if err := queue.initialize(ctx); err != nil {
		return fmt.Errorf("initialize event queue: %w", err)
	}
	encoded, err := json.Marshal(event)
	if err != nil {
		return err
	}
	partition := int(crc32.ChecksumIEEE([]byte(event.RequestID)) % uint32(queue.options.Partitions))
	return queue.client.XAdd(ctx, &redis.XAddArgs{Stream: queue.stream(partition), Values: map[string]any{"event": string(encoded)}}).Err()
}

func (queue *RedisQueue) Consume(ctx context.Context, consumer string, limit int64) (Batch, error) {
	if consumer == "" || limit < 1 {
		return Batch{}, errors.New("consumer and positive batch limit are required")
	}
	if err := queue.initialize(ctx); err != nil {
		return Batch{}, err
	}
	queue.mu.Lock()
	start := queue.next
	queue.next = (queue.next + 1) % queue.options.Partitions
	queue.mu.Unlock()
	for offset := 0; offset < queue.options.Partitions; offset++ {
		partition := (start + offset) % queue.options.Partitions
		token, err := uuid.NewRandom()
		if err != nil {
			return Batch{}, err
		}
		owned, err := queue.client.SetNX(ctx, queue.lease(partition), token.String(), queue.options.LeaseDuration).Result()
		if err != nil {
			return Batch{}, err
		}
		if !owned {
			continue
		}
		batch := Batch{Partition: partition, Token: token.String()}
		messages, err := queue.readPartition(ctx, partition, consumer, limit)
		if err != nil {
			queue.forgetGroups(err)
			_ = queue.Release(ctx, batch)
			return Batch{}, err
		}
		if len(messages) == 0 {
			if err := queue.Release(ctx, batch); err != nil {
				return Batch{}, err
			}
			continue
		}
		for _, message := range messages {
			batch.Messages = append(batch.Messages, decodeMessage(message))
		}
		return batch, nil
	}
	return Batch{Partition: -1}, nil
}

func (queue *RedisQueue) readPartition(ctx context.Context, partition int, consumer string, limit int64) ([]redis.XMessage, error) {
	messages, _, err := queue.client.XAutoClaim(ctx, &redis.XAutoClaimArgs{Stream: queue.stream(partition), Group: queue.options.Group, Consumer: consumer, MinIdle: 0, Start: "0-0", Count: limit}).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, err
	}
	if len(messages) > 0 {
		return messages, nil
	}
	streams, err := queue.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: queue.options.Group, Consumer: consumer, Streams: []string{queue.stream(partition), ">"}, Count: limit, Block: -1}).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(streams) == 0 {
		return nil, nil
	}
	return streams[0].Messages, nil
}

func (queue *RedisQueue) Renew(ctx context.Context, batch Batch) error {
	script := `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end`
	renewed, err := queue.client.Eval(ctx, script, []string{queue.lease(batch.Partition)}, batch.Token, queue.options.LeaseDuration.Milliseconds()).Int()
	if err != nil {
		return err
	}
	if renewed != 1 {
		return errors.New("queue partition lease lost")
	}
	return nil
}

func (queue *RedisQueue) Release(ctx context.Context, batch Batch) error {
	if batch.Partition < 0 || batch.Token == "" {
		return nil
	}
	script := `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`
	return queue.client.Eval(ctx, script, []string{queue.lease(batch.Partition)}, batch.Token).Err()
}

func (queue *RedisQueue) Ack(ctx context.Context, batch Batch) error {
	if len(batch.Messages) == 0 {
		return nil
	}
	ids := make([]string, 0, len(batch.Messages))
	for _, message := range batch.Messages {
		ids = append(ids, message.ID)
	}
	// The owner check and ACK are atomic; an expired consumer cannot ACK a successor's work.
	script := `if redis.call('GET',KEYS[1]) ~= ARGV[1] then return redis.error_reply('partition lease lost') end; return redis.call('XACK',KEYS[2],ARGV[2],unpack(ARGV,3))`
	arguments := []any{batch.Token, queue.options.Group}
	for _, id := range ids {
		arguments = append(arguments, id)
	}
	return queue.client.Eval(ctx, script, []string{queue.lease(batch.Partition), queue.stream(batch.Partition)}, arguments...).Err()
}

func (queue *RedisQueue) DeadLetter(ctx context.Context, batch Batch, reason string) error {
	script := `if redis.call('GET',KEYS[1]) ~= ARGV[1] then return redis.error_reply('partition lease lost') end
 local pending=redis.call('XPENDING',KEYS[2],ARGV[2],ARGV[3],ARGV[3],1)
 if #pending==0 then return 0 end
 redis.call('XADD',KEYS[3],'*','event',ARGV[4],'reason',ARGV[5],'partition',ARGV[6],'source_id',ARGV[3])
 return redis.call('XACK',KEYS[2],ARGV[2],ARGV[3])`
	for _, message := range batch.Messages {
		raw := message.Raw
		if raw == "" {
			encoded, err := json.Marshal(message.Event)
			if err != nil {
				return err
			}
			raw = string(encoded)
		}
		if err := queue.client.Eval(ctx, script, []string{queue.lease(batch.Partition), queue.stream(batch.Partition), queue.options.Prefix + ":dead"}, batch.Token, queue.options.Group, message.ID, raw, reason, batch.Partition).Err(); err != nil {
			return err
		}
	}
	return nil
}

func decodeMessage(message redis.XMessage) Message {
	raw, ok := message.Values["event"].(string)
	decoded := Message{ID: message.ID, Raw: raw}
	if !ok {
		decoded.DecodeError = "event payload is not text"
		decoded.Raw = fmt.Sprint(message.Values)
		return decoded
	}
	if err := json.Unmarshal([]byte(raw), &decoded.Event); err != nil {
		decoded.DecodeError = "invalid event JSON"
	}
	return decoded
}

func (queue *RedisQueue) ReplayDeadLetter(ctx context.Context, id string) error {
	messages, err := queue.client.XRangeN(ctx, queue.options.Prefix+":dead", id, id, 1).Result()
	if err != nil {
		return err
	}
	if len(messages) != 1 {
		return ErrNotFound
	}
	encoded, ok := messages[0].Values["event"].(string)
	if !ok {
		return errors.New("invalid dead letter payload")
	}
	var event Event
	if err := json.Unmarshal([]byte(encoded), &event); err != nil {
		return err
	}
	if err := queue.Publish(ctx, event); err != nil {
		return err
	}
	return queue.client.XDel(ctx, queue.options.Prefix+":dead", id).Err()
}

func (queue *RedisQueue) Trim(ctx context.Context) error {
	if err := queue.initialize(ctx); err != nil {
		return err
	}
	for partition := 0; partition < queue.options.Partitions; partition++ {
		groups, err := queue.client.XInfoGroups(ctx, queue.stream(partition)).Result()
		if err != nil {
			return err
		}
		boundary := ""
		for _, group := range groups {
			safe := group.LastDeliveredID
			pending, err := queue.client.XPending(ctx, queue.stream(partition), group.Name).Result()
			if err != nil {
				return err
			}
			if pending.Count > 0 && earlierStreamID(pending.Lower, safe) {
				safe = pending.Lower
			}
			if boundary == "" || earlierStreamID(safe, boundary) {
				boundary = safe
			}
		}
		if boundary != "" && boundary != "0-0" {
			if err := queue.client.XTrimMinID(ctx, queue.stream(partition), boundary).Err(); err != nil {
				return err
			}
		}
	}
	return nil
}

func earlierStreamID(left, right string) bool {
	leftParts, rightParts := strings.Split(left, "-"), strings.Split(right, "-")
	if len(leftParts) != 2 || len(rightParts) != 2 {
		return false
	}
	for index := 0; index < 2; index++ {
		leftNumber, leftErr := strconv.ParseUint(leftParts[index], 10, 64)
		rightNumber, rightErr := strconv.ParseUint(rightParts[index], 10, 64)
		if leftErr != nil || rightErr != nil {
			return false
		}
		if leftNumber != rightNumber {
			return leftNumber < rightNumber
		}
	}
	return false
}

func (queue *RedisQueue) Health(ctx context.Context) (QueueHealth, error) {
	if err := queue.initialize(ctx); err != nil {
		return QueueHealth{}, err
	}
	var health QueueHealth
	for partition := 0; partition < queue.options.Partitions; partition++ {
		groups, err := queue.client.XInfoGroups(ctx, queue.stream(partition)).Result()
		if err != nil {
			return health, err
		}
		for _, group := range groups {
			if group.Name == queue.options.Group {
				health.Pending += group.Pending
				health.Queued += group.Lag
			}
		}
	}
	dead, err := queue.client.XLen(ctx, queue.options.Prefix+":dead").Result()
	health.DeadLetters = dead
	return health, err
}

func (queue *RedisQueue) Poll(ctx context.Context, batch Batch, consumer string, limit int64) ([]Message, error) {
	if limit < 1 {
		return nil, nil
	}
	if err := queue.Renew(ctx, batch); err != nil {
		return nil, err
	}
	streams, err := queue.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: queue.options.Group, Consumer: consumer, Streams: []string{queue.stream(batch.Partition), ">"}, Count: limit, Block: -1}).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	result := []Message{}
	for _, stream := range streams {
		for _, message := range stream.Messages {
			result = append(result, decodeMessage(message))
		}
	}
	return result, nil
}

func (queue *RedisQueue) forgetGroups(err error) {
	if err == nil || !strings.Contains(err.Error(), "NOGROUP") {
		return
	}
	queue.mu.Lock()
	queue.ready = false
	queue.mu.Unlock()
}
