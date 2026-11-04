package runner

import (
	"sync"
	"time"
)

// retryGate spaces out retries of work that keeps failing for a reason the daemon cannot fix
// itself: the control plane is down, or it answers one item with a server error every time. Each
// key waits twice as long after every failure, from base up to limit, and a success forgets it.
// Nothing is ever given up: a completion or receipt is evidence and stays in custody until the
// control plane records or refuses it. The gate only stops the daemon retrying, and logging, at
// a fixed short interval forever. Its memory is per process: a restart tries everything at once.
type retryGate struct {
	mu          sync.Mutex
	base, limit time.Duration
	keys        map[string]retryState
}

type retryState struct {
	failures int
	next     time.Time
}

func newRetryGate(base, limit time.Duration) *retryGate {
	return &retryGate{base: base, limit: limit, keys: map[string]retryState{}}
}

// due reports whether key may be tried at now.
func (g *retryGate) due(key string, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	s, ok := g.keys[key]
	return !ok || !now.Before(s.next)
}

// failed records a failed try of key at now and returns how many tries have failed in a row and
// how long the next one waits.
func (g *retryGate) failed(key string, now time.Time) (int, time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()
	s := g.keys[key]
	s.failures++
	wait := g.base
	for i := 1; i < s.failures && wait < g.limit; i++ {
		wait *= 2
	}
	wait = min(wait, g.limit)
	s.next = now.Add(wait)
	g.keys[key] = s
	return s.failures, wait
}

// forget clears key after it succeeded or no longer needs trying.
func (g *retryGate) forget(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.keys, key)
}
