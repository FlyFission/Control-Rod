//go:build unix

package runner

import (
	"strings"
	"testing"
	"time"
)

// A run whose agent reported a failed turn tells the person why, in plain words (review DMN-13).
func TestAFailedTurnSaysWhyInTheRunsError(t *testing.T) {
	script := `echo '{"type":"result","subtype":"success","is_error":true,"result":"Claude AI usage limit reached|1764000000"}'`
	comp, events, _ := runFake(t, "run-turn-error", script, 5*time.Second)
	if comp.Status != "failed" {
		t.Fatalf("status %q", comp.Status)
	}
	want := "the runtime reported that its turn failed. The agent's usage limit is reached. Wait for it to reset, or set the card to another agent. The agent said: \"Claude AI usage limit reached|1764000000\""
	if comp.Error != want {
		t.Fatalf("error %q", comp.Error)
	}
	var exit string
	for _, e := range events {
		if e.Kind == EvExit {
			exit = e.Text
		}
	}
	if !strings.Contains(exit, "usage limit is reached") {
		t.Fatalf("exit event %q", exit)
	}
}

// An agent that exits with an error status after a sign-in error on stderr says so too.
func TestAnErrorExitNamesASignInProblem(t *testing.T) {
	script := `echo 'Error: Invalid API key. Please run /login' >&2
exit 1`
	comp, _, _ := runFake(t, "run-exit-signin", script, 5*time.Second)
	if comp.Status != "failed" || !strings.HasPrefix(comp.Error, "agent exited with status 1. The agent's sign-in has expired") {
		t.Fatalf("status %q error %q", comp.Status, comp.Error)
	}
	if comp.FailureKind != "exited" {
		t.Fatalf("failure kind %q, want exited", comp.FailureKind)
	}
}
