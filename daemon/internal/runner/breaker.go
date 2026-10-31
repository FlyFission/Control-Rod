package runner

import (
	"fmt"
	"sync"
	"time"
)

// Breaker watches a run's normalized events for a runaway agent (specification 22). The policy
// follows Munder Difflin's breaker ladder (register entry in docs/patterns/workbench-donors.md;
// written from the specification, no donor code): a warning first, then a trip that stops the run.
// Three signals count:
//   - velocity: more tool calls in one minute than a person could follow;
//   - repetition: the same tool with the same input, again and again in a row;
//   - no progress: many tool calls with no file change and no message for a long stretch.
type Breaker struct {
	mu     sync.Mutex
	policy BreakerPolicy

	starts     []time.Time
	lastCall   string
	repeats    int
	sinceWork  int
	lastWork   time.Time
	warned     map[string]bool
	tripReason string
}

// BreakerPolicy sets the breaker's thresholds. Warn levels are where a warning is raised; trip
// levels stop the run.
type BreakerPolicy struct {
	VelocityWarn, VelocityTrip int           // tool calls within one minute
	RepeatWarn, RepeatTrip     int           // identical consecutive tool calls
	StallCalls                 int           // tool calls without progress before a stall can trip
	StallFor                   time.Duration // and for at least this long
}

// DefaultBreakerPolicy is generous: it stops only clear runaways.
var DefaultBreakerPolicy = BreakerPolicy{VelocityWarn: 60, VelocityTrip: 120, RepeatWarn: 5, RepeatTrip: 8, StallCalls: 40, StallFor: 10 * time.Minute}

// NewBreaker returns a breaker for one run.
func NewBreaker(p BreakerPolicy, start time.Time) *Breaker {
	return &Breaker{policy: p, lastWork: start, warned: map[string]bool{}}
}

// Verdict is what the breaker decided about the events it was just given.
type Verdict struct {
	// Warnings are first crossings of a warning level, each said once.
	Warnings []string
	// Trip is set once the run must stop, with the reason.
	Trip string
}

// Observe feeds events to the breaker.
func (b *Breaker) Observe(events []Event, now time.Time) Verdict {
	b.mu.Lock()
	defer b.mu.Unlock()
	var v Verdict
	if b.tripReason != "" {
		return v
	}
	warn := func(key, text string) {
		if !b.warned[key] {
			b.warned[key] = true
			v.Warnings = append(v.Warnings, text)
		}
	}
	for _, e := range events {
		switch e.Kind {
		case EvFileChange, EvMessage:
			b.sinceWork, b.lastWork = 0, now
		case EvToolStart:
			// An edit or write counts as progress too: Claude Code reports file changes as tool calls.
			if e.Summary != "" && len(e.Summary) > 5 && e.Summary[:5] == "Edit:" {
				b.sinceWork, b.lastWork = 0, now
			} else {
				b.sinceWork++
			}
			b.starts = append(b.starts, now)
			cut := 0
			for cut < len(b.starts) && now.Sub(b.starts[cut]) > time.Minute {
				cut++
			}
			b.starts = b.starts[cut:]
			call := e.Tool + "\x00" + e.InputDigest
			if call == b.lastCall {
				b.repeats++
			} else {
				b.lastCall, b.repeats = call, 1
			}
			p := b.policy
			switch {
			case p.VelocityTrip > 0 && len(b.starts) >= p.VelocityTrip:
				b.tripReason = fmt.Sprintf("%d tool calls within one minute", len(b.starts))
			case p.RepeatTrip > 0 && b.repeats >= p.RepeatTrip:
				b.tripReason = fmt.Sprintf("the same %s call with the same input %d times in a row", e.Tool, b.repeats)
			case p.StallCalls > 0 && b.sinceWork >= p.StallCalls && now.Sub(b.lastWork) >= p.StallFor:
				b.tripReason = fmt.Sprintf("%d tool calls over %s with no file change or message", b.sinceWork, now.Sub(b.lastWork).Round(time.Second))
			}
			if b.tripReason != "" {
				v.Trip = b.tripReason
				return v
			}
			if p.VelocityWarn > 0 && len(b.starts) >= p.VelocityWarn {
				warn("velocity", fmt.Sprintf("%d tool calls within one minute", len(b.starts)))
			}
			if p.RepeatWarn > 0 && b.repeats >= p.RepeatWarn {
				warn("repeat:"+call, fmt.Sprintf("the same %s call with the same input %d times in a row", e.Tool, b.repeats))
			}
		}
	}
	return v
}
