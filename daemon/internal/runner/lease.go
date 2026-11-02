package runner

import (
	"sync"
	"time"
)

// leaseClock is the daemon's view of when the control plane's lease on a run ends (specification
// 22a): the earlier of the lease end the control plane advertised and three heartbeats after the
// request that won it was sent. It never trusts the reply's arrival time, so a slow answer or slow
// preparation cannot stretch it. Past it the daemon cannot know whether SCRAM holds or the run was
// given up, and stops the run.
type leaseClock struct {
	mu  sync.Mutex
	end time.Time
	hb  time.Duration
}

func newLeaseClock(sent time.Time, advertised string, hb time.Duration) *leaseClock {
	l := &leaseClock{hb: hb}
	l.end = l.bound(sent, advertised)
	return l
}

func (l *leaseClock) bound(sent time.Time, advertised string) time.Time {
	end := sent.Add(3 * l.hb)
	if t, err := time.Parse(time.RFC3339Nano, advertised); err == nil && t.Before(end) {
		end = t
	}
	return end
}

// renew records a lease the control plane granted to a request sent at sent.
func (l *leaseClock) renew(sent time.Time, advertised string) {
	end := l.bound(sent, advertised)
	l.mu.Lock()
	if end.After(l.end) {
		l.end = end
	}
	l.mu.Unlock()
}

func (l *leaseClock) deadline() time.Time {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.end
}

// watch stops the run (through stop) when the lease ends, until done closes; renewals move it.
func (l *leaseClock) watch(done <-chan struct{}, stop func()) {
	for {
		wait := time.Until(l.deadline())
		if wait <= 0 {
			stop()
			return
		}
		t := time.NewTimer(wait)
		select {
		case <-done:
			t.Stop()
			return
		case <-t.C:
		}
	}
}
