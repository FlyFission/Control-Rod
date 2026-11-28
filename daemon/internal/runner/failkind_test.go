package runner

import (
	"errors"
	"fmt"
	"os/exec"
	"testing"
)

// Each error the daemon makes maps to its fixed failure kind; anything else has none (change
// record failure-kinds).
func TestFailKind(t *testing.T) {
	exitErr := exec.Command("false").Run()
	if exitErr == nil {
		t.Fatal("expected false to exit with an error status")
	}
	cases := []struct {
		err  error
		want string
	}{
		{nil, ""},
		{ErrTimeout, "timeout"},
		{fmt.Errorf("run: %w", ErrTimeout), "timeout"},
		{errShutdown, "shutdown"},
		{errLost, "lost"},
		{errStopped, "stopped"},
		{errOutOfContact, "out-of-contact"},
		{errSettled, "unfinished-turn"},
		{errBreaker{reason: "too many tool calls"}, "breaker"},
		{fmt.Errorf("agent: %w", exitErr), "exited"},
		{errors.New("boom"), ""},
	}
	for _, c := range cases {
		if got := failKind(c.err); got != c.want {
			t.Errorf("failKind(%v) = %q, want %q", c.err, got, c.want)
		}
	}
}
