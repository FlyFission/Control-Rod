package battlescars

import (
	"sync"
	"time"
)

// DeliveryDecision represents the outcome of evaluating a message or worker
// report delivery attempt against a BoundedDeliveryBudget.
type DeliveryDecision string

const (
	// DeliveryRetry indicates the item is within budget and may be attempted or retried.
	DeliveryRetry DeliveryDecision = "retry"
	// DeliveryDeadLetter indicates the item has exhausted MaxAttempts or MaxAge
	// and has been quarantined in the dead-letter set rather than retrying forever.
	DeliveryDeadLetter DeliveryDecision = "dead_letter"
	// DeliveryAcked indicates the item has already been acknowledged as delivered.
	DeliveryAcked DeliveryDecision = "acked"
)

// DeliveryRecord captures the delivery attempt history for a single tracked item.
type DeliveryRecord struct {
	ItemID       string
	Attempts     int
	FirstAttempt time.Time
	LastAttempt  time.Time
	LastReason   string
	Decision     DeliveryDecision
}

// BoundedDeliveryBudget enforces per-item retry limits (MaxAttempts and MaxAge)
// so undeliverable messages or worker reports are quarantined into a dead-letter
// state rather than wedging the dispatcher loop indefinitely.
type BoundedDeliveryBudget struct {
	MaxAttempts int
	MaxAge      time.Duration

	mu      sync.Mutex
	records map[string]*DeliveryRecord
}

// NewBoundedDeliveryBudget creates a BoundedDeliveryBudget with the given
// maxAttempts and maxAge thresholds. If maxAttempts <= 0, it defaults to 3.
// If maxAge <= 0, it defaults to 5 minutes.
func NewBoundedDeliveryBudget(maxAttempts int, maxAge time.Duration) *BoundedDeliveryBudget {
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	if maxAge <= 0 {
		maxAge = 5 * time.Minute
	}
	return &BoundedDeliveryBudget{
		MaxAttempts: maxAttempts,
		MaxAge:      maxAge,
		records:     make(map[string]*DeliveryRecord),
	}
}

// RecordAttempt evaluates and records a delivery attempt for itemID at timestamp now.
//
//   - If itemID was already acknowledged via Ack, it returns DeliveryAcked.
//   - If itemID was already quarantined, or if this attempt exceeds MaxAttempts
//     or now.Sub(firstAttempt) > MaxAge, the item is marked DeliveryDeadLetter
//     and DeliveryDeadLetter is returned.
//   - Otherwise, the attempt counter is incremented and DeliveryRetry is returned.
func (b *BoundedDeliveryBudget) RecordAttempt(itemID string, now time.Time) DeliveryDecision {
	return b.RecordAttemptWithReason(itemID, now, "")
}

// RecordAttemptWithReason behaves like RecordAttempt while storing an optional
// diagnostic failure reason on the item's DeliveryRecord.
func (b *BoundedDeliveryBudget) RecordAttemptWithReason(itemID string, now time.Time, reason string) DeliveryDecision {
	if now.IsZero() {
		now = time.Now().UTC()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	if b.records == nil {
		b.records = make(map[string]*DeliveryRecord)
	}
	maxAttempts := b.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	maxAge := b.MaxAge
	if maxAge <= 0 {
		maxAge = 5 * time.Minute
	}

	rec, ok := b.records[itemID]
	if !ok {
		rec = &DeliveryRecord{
			ItemID:       itemID,
			FirstAttempt: now,
			LastAttempt:  now,
			Attempts:     1,
			LastReason:   reason,
			Decision:     DeliveryRetry,
		}
		if rec.Attempts > maxAttempts {
			rec.Decision = DeliveryDeadLetter
		}
		b.records[itemID] = rec
		return rec.Decision
	}

	if rec.Decision == DeliveryAcked || rec.Decision == DeliveryDeadLetter {
		return rec.Decision
	}

	rec.Attempts++
	rec.LastAttempt = now
	if reason != "" {
		rec.LastReason = reason
	}

	age := now.Sub(rec.FirstAttempt)
	if rec.Attempts > maxAttempts || age > maxAge {
		rec.Decision = DeliveryDeadLetter
		return DeliveryDeadLetter
	}

	rec.Decision = DeliveryRetry
	return DeliveryRetry
}

// Ack marks itemID as successfully delivered and returns DeliveryAcked.
func (b *BoundedDeliveryBudget) Ack(itemID string, now time.Time) DeliveryDecision {
	if now.IsZero() {
		now = time.Now().UTC()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	if b.records == nil {
		b.records = make(map[string]*DeliveryRecord)
	}
	rec, ok := b.records[itemID]
	if !ok {
		rec = &DeliveryRecord{
			ItemID:       itemID,
			FirstAttempt: now,
			LastAttempt:  now,
			Attempts:     1,
		}
		b.records[itemID] = rec
	} else {
		rec.LastAttempt = now
	}
	rec.Decision = DeliveryAcked
	return DeliveryAcked
}

// Inspect returns a copy of the DeliveryRecord for itemID, if tracked.
func (b *BoundedDeliveryBudget) Inspect(itemID string) (DeliveryRecord, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	rec, ok := b.records[itemID]
	if !ok {
		return DeliveryRecord{}, false
	}
	return *rec, true
}

// DeadLetters returns a snapshot of all quarantined dead-letter items.
func (b *BoundedDeliveryBudget) DeadLetters() []DeliveryRecord {
	b.mu.Lock()
	defer b.mu.Unlock()

	var out []DeliveryRecord
	for _, rec := range b.records {
		if rec.Decision == DeliveryDeadLetter {
			out = append(out, *rec)
		}
	}
	return out
}
