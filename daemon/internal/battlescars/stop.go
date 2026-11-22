package battlescars

import (
	"strings"
	"sync"
)

// SessionStopPhase represents the lifecycle state of a session relevant to stop
// signal coordination.
type SessionStopPhase string

const (
	// PhaseRunning indicates the session is actively executing turns.
	PhaseRunning SessionStopPhase = "running"
	// PhaseWaking indicates the session is transitioning out of sleep/restore.
	PhaseWaking SessionStopPhase = "waking"
	// PhaseArchiving indicates the session is being torn down or archived.
	PhaseArchiving SessionStopPhase = "archiving"
)

type sessionStopState struct {
	phase        SessionStopPhase
	stoppedTurns map[string]struct{}
}

// IdempotentStopTracker coordinates turn-scoped (sessionID, turnID) stop
// requests across concurrent callers so that at most one OS interrupt / kill
// signal is emitted per turn, and duplicate stop requests or requests against
// waking/archiving sessions become safe no-ops instead of triggering repeated
// Ctrl-C / kill loops.
type IdempotentStopTracker struct {
	mu       sync.Mutex
	sessions map[string]*sessionStopState
}

// NewIdempotentStopTracker constructs an initialized IdempotentStopTracker.
func NewIdempotentStopTracker() *IdempotentStopTracker {
	return &IdempotentStopTracker{
		sessions: make(map[string]*sessionStopState),
	}
}

// SetSessionPhase records the current lifecycle phase of sessionID (e.g.
// PhaseRunning, PhaseWaking, PhaseArchiving). Setting a session to PhaseWaking
// or PhaseArchiving suppresses new stop signals for that session while it is
// in that phase.
func (t *IdempotentStopTracker) SetSessionPhase(sessionID string, phase SessionStopPhase) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	st := t.ensureSessionLocked(sessionID)
	st.phase = phase
}

// RequestStop registers a stop intent for (sessionID, turnID).
//
// The first call for an active turn returns (shouldSignal=true, alreadyStopped=false).
// Subsequent calls for the same (sessionID, turnID), or calls made while the
// session is in PhaseWaking or PhaseArchiving, or calls with an empty
// sessionID, return (shouldSignal=false, alreadyStopped=true).
func (t *IdempotentStopTracker) RequestStop(sessionID, turnID string) (shouldSignal bool, alreadyStopped bool) {
	sessionID = strings.TrimSpace(sessionID)
	turnID = strings.TrimSpace(turnID)
	if sessionID == "" {
		return false, true
	}
	if turnID == "" {
		turnID = "__default_turn__"
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	st := t.ensureSessionLocked(sessionID)
	if st.phase == PhaseWaking || st.phase == PhaseArchiving {
		return false, true
	}

	if _, exists := st.stoppedTurns[turnID]; exists {
		return false, true
	}
	st.stoppedTurns[turnID] = struct{}{}
	return true, false
}

// ClearSession removes all tracked state for sessionID after final teardown.
func (t *IdempotentStopTracker) ClearSession(sessionID string) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.sessions, sessionID)
}

func (t *IdempotentStopTracker) ensureSessionLocked(sessionID string) *sessionStopState {
	if t.sessions == nil {
		t.sessions = make(map[string]*sessionStopState)
	}
	st, ok := t.sessions[sessionID]
	if !ok {
		st = &sessionStopState{
			phase:        PhaseRunning,
			stoppedTurns: make(map[string]struct{}),
		}
		t.sessions[sessionID] = st
	}
	return st
}
