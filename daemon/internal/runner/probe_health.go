package runner

import (
	"context"
	"errors"
	"strings"
	"sync"
)

// ProbeOutcome classifies a runtime probe result so transient probe execution errors
// (such as timeouts, temporary I/O hiccups, or context cancellation) are distinguished
// from definitively unavailable or unauthenticated runtimes.
type ProbeOutcome string

const (
	// ProbeReady means the runtime is installed, pinned, and ready to accept work.
	ProbeReady ProbeOutcome = "ready"
	// ProbeDead means the runtime is definitively not ready (e.g. binary missing,
	// unpinned script launcher, or signed out).
	ProbeDead ProbeOutcome = "dead"
	// ProbeFailed means the probe itself encountered a transient failure (e.g.
	// context deadline/cancellation or transient OS error) and must NOT be collapsed
	// into ProbeDead.
	ProbeFailed ProbeOutcome = "failed"
)

// ClassifyProbeOutcome determines the ProbeOutcome for a RuntimeStatus and optional
// probe execution error. Transient errors never collapse to ProbeDead.
func ClassifyProbeOutcome(st RuntimeStatus, err error) ProbeOutcome {
	if st.Ready {
		return ProbeReady
	}
	if err != nil {
		if isTransientProbeError(err) {
			return ProbeFailed
		}
	}
	low := strings.ToLower(st.Reason)
	if strings.Contains(low, "context deadline exceeded") ||
		strings.Contains(low, "context canceled") ||
		strings.Contains(low, "temporarily unavailable") ||
		strings.Contains(low, "resource temporarily unavailable") ||
		strings.Contains(low, "text file busy") ||
		strings.Contains(low, "i/o timeout") {
		return ProbeFailed
	}
	return ProbeDead
}

func isTransientProbeError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "temporarily unavailable") ||
		strings.Contains(low, "text file busy") ||
		strings.Contains(low, "i/o timeout") ||
		strings.Contains(low, "deadline exceeded")
}

// ProbeObservation pairs a RuntimeStatus with its classified ProbeOutcome.
type ProbeObservation struct {
	Status  RuntimeStatus
	Outcome ProbeOutcome
}

// BootBarrier coordinates startup orphan recovery and steady-state probe loops so
// background sweeps or probes wait until initial boot recovery has completed.
type BootBarrier struct {
	once   sync.Once
	ready  chan struct{}
	startF func()
}

// NewBootBarrier returns an unreleased BootBarrier. If fn is non-nil, it is invoked
// after the barrier is released (or immediately if StartAfter is called after Release).
func NewBootBarrier() *BootBarrier {
	return &BootBarrier{ready: make(chan struct{})}
}

// Release opens the boot barrier, allowing any goroutines waiting in Wait or
// scheduled via StartAfter to proceed. Release is idempotent.
func (b *BootBarrier) Release() {
	b.once.Do(func() {
		close(b.ready)
	})
}

// Wait blocks until the boot barrier is released or ctx is canceled.
func (b *BootBarrier) Wait(ctx context.Context) error {
	select {
	case <-b.ready:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// StartAfter waits in a background goroutine for the boot barrier to be released
// (or ctx to be canceled) and invokes fn only once the barrier is released while ctx
// is still active. It returns a channel closed when fn finishes (or when ctx cancels
// before release).
func (b *BootBarrier) StartAfter(ctx context.Context, fn func(context.Context)) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := b.Wait(ctx); err != nil {
			return
		}
		if ctx.Err() != nil {
			return
		}
		fn(ctx)
	}()
	return done
}

const (
	defaultMassFailureMinRuntimes = 5
	defaultMassFailureNumerator   = 1
	defaultMassFailureDenominator = 2
)

// MassFailureBreaker prevents a single degraded probe pass (for example, host memory
// pressure or transient PATH/keychain failure) from wiping out the last known healthy
// runtime statuses when >=50% of >=5 runtimes fail in one pass.
type MassFailureBreaker struct {
	MinRuntimes int
}

// EvaluatePass inspects a single probe pass across observations and compares it
// against the previous known statuses. If total observations >= MinRuntimes (default 5)
// and >=50% of observations are non-ready (ProbeFailed or ProbeDead transitioning from
// ready/failing in bulk), the breaker trips and preserves previous statuses for
// entries that were previously Ready and failed in this pass.
func (m MassFailureBreaker) EvaluatePass(prev []RuntimeStatus, current []ProbeObservation) (effective []RuntimeStatus, tripped bool) {
	minRuntimes := m.MinRuntimes
	if minRuntimes <= 0 {
		minRuntimes = defaultMassFailureMinRuntimes
	}

	total := len(current)
	failedCount := 0
	for _, obs := range current {
		if obs.Outcome == ProbeFailed || !obs.Status.Ready {
			failedCount++
		}
	}

	// Trip if total >= minRuntimes and failedCount / total >= 50% (i.e. failedCount*2 >= total).
	tripped = total >= minRuntimes && failedCount*defaultMassFailureDenominator >= total*defaultMassFailureNumerator

	prevByName := make(map[string]RuntimeStatus, len(prev))
	for _, st := range prev {
		prevByName[st.Runtime] = st
	}

	effective = make([]RuntimeStatus, 0, total)
	for _, obs := range current {
		if obs.Status.Ready {
			effective = append(effective, obs.Status)
			continue
		}
		// Never collapse a transient ProbeFailed into dead when we have a prior Ready status,
		// and when the mass-failure breaker trips, preserve any prior Ready statuses across the pass.
		if prevSt, ok := prevByName[obs.Status.Runtime]; ok && prevSt.Ready {
			if obs.Outcome == ProbeFailed || tripped {
				effective = append(effective, prevSt)
				continue
			}
		}
		effective = append(effective, obs.Status)
	}
	return effective, tripped
}
