package runner

import "testing"

// A runtime counts as "not supported yet" only while its confinement gap is open on this
// platform; once it is confined, any refusal (an old version, a missing login) shows in its own
// words.
func TestAwaitingConfinementFollowsTheGap(t *testing.T) {
	for _, rt := range []string{RuntimeClaude, RuntimeCodex, RuntimeAgy, RuntimeGrok, "opencode", "ollama"} {
		a, ok := AdapterFor(rt)
		if !ok {
			continue
		}
		gap := ""
		if w, ok := a.(AwaitingConfinement); ok {
			gap = w.ConfinementGap()
		}
		if got := awaitingConfinement(rt); got != (gap != "") {
			t.Errorf("%s: awaitingConfinement = %v with gap %q", rt, got, gap)
		}
	}
}

func TestAgentVersionAtLeast(t *testing.T) {
	for _, c := range []struct {
		v, tested string
		ok, newer bool
	}{
		{"1.0.92", "1.0.92", true, false},
		{"grok 1.0.93 (abc) [stable]", "1.0.92", true, true},
		{"1.0.91", "1.0.92", false, false},
		{"1.0.92-rc.1", "1.0.92", false, false},
		{"1.0.93-rc.1", "1.0.92", true, true},
		{"1.0.92+build", "1.0.92", true, true},
		{"grok 1.0.92.0-rc.1", "1.0.92", false, false},
		{"1.0.92+build-7", "1.0.92", false, false},
		{"10.0.0", "9.99.99", true, true},
		{"", "1.0.92", false, false},
	} {
		ok, newer := agentVersionAtLeast(c.v, c.tested)
		if ok != c.ok || newer != c.newer {
			t.Errorf("%q vs %s: got %v %v, want %v %v", c.v, c.tested, ok, newer, c.ok, c.newer)
		}
	}
}
