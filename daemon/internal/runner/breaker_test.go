//go:build unix

package runner

import (
	"strings"
	"testing"
	"time"
)

func call(tool, digest string) Event {
	return Event{Kind: EvToolStart, Tool: tool, InputDigest: digest, Summary: "Run: x"}
}

func TestBreakerWarnsThenTripsOnRepetition(t *testing.T) {
	b := NewBreaker(BreakerPolicy{RepeatWarn: 3, RepeatTrip: 5}, t0)
	var warnings []string
	for i := 1; i <= 4; i++ {
		v := b.Observe([]Event{call("Bash", "same")}, t0.Add(time.Duration(i)*time.Second))
		warnings = append(warnings, v.Warnings...)
		if v.Trip != "" {
			t.Fatalf("tripped early at %d", i)
		}
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "3 times in a row") {
		t.Fatalf("one warning expected, got %v", warnings)
	}
	v := b.Observe([]Event{call("Bash", "same")}, t0.Add(5*time.Second))
	if !strings.Contains(v.Trip, "the same Bash call with the same input 5 times in a row") {
		t.Fatalf("trip %q", v.Trip)
	}
	if again := b.Observe([]Event{call("Bash", "same")}, t0.Add(6*time.Second)); again.Trip != "" || len(again.Warnings) != 0 {
		t.Fatal("a tripped breaker says nothing more")
	}
}

func TestBreakerDoesNotTripOnVariedWork(t *testing.T) {
	b := NewBreaker(BreakerPolicy{RepeatWarn: 3, RepeatTrip: 5}, t0)
	for i := 0; i < 50; i++ {
		d := "a"
		if i%2 == 1 {
			d = "b"
		}
		if v := b.Observe([]Event{call("Bash", d)}, t0.Add(time.Duration(i)*time.Second)); v.Trip != "" {
			t.Fatalf("tripped on alternating calls: %s", v.Trip)
		}
	}
}

func TestBreakerTripsOnVelocity(t *testing.T) {
	b := NewBreaker(BreakerPolicy{VelocityWarn: 5, VelocityTrip: 10}, t0)
	var trip string
	for i := 0; i < 10 && trip == ""; i++ {
		trip = b.Observe([]Event{call("Read", string(rune('a'+i)))}, t0.Add(time.Duration(i)*time.Second)).Trip
	}
	if !strings.Contains(trip, "10 tool calls within one minute") {
		t.Fatalf("trip %q", trip)
	}
	// Spread over minutes, the same count is fine.
	slow := NewBreaker(BreakerPolicy{VelocityWarn: 5, VelocityTrip: 10}, t0)
	for i := 0; i < 30; i++ {
		if v := slow.Observe([]Event{call("Read", string(rune('a'+i)))}, t0.Add(time.Duration(i)*10*time.Second)); v.Trip != "" {
			t.Fatalf("tripped at a slow pace: %s", v.Trip)
		}
	}
}

func TestBreakerTripsOnNoProgressAndProgressResetsIt(t *testing.T) {
	b := NewBreaker(BreakerPolicy{StallCalls: 5, StallFor: time.Minute}, t0)
	for i := 0; i < 10; i++ {
		if v := b.Observe([]Event{call("Grep", string(rune('a'+i)))}, t0.Add(time.Duration(i)*time.Second)); v.Trip != "" {
			t.Fatal("a stall needs time as well as calls")
		}
	}
	b.Observe([]Event{{Kind: EvFileChange, Path: "out/x.md"}}, t0.Add(30*time.Second))
	for i := 0; i < 6; i++ {
		if v := b.Observe([]Event{call("Grep", string(rune('k'+i)))}, t0.Add(40*time.Second)); v.Trip != "" {
			t.Fatal("progress resets the stall count")
		}
	}
	v := b.Observe([]Event{call("Grep", "z")}, t0.Add(2*time.Minute))
	if !strings.Contains(v.Trip, "with no file change or message") {
		t.Fatalf("trip %q", v.Trip)
	}
}

func TestOnlyASucceededEditCountsAsProgress(t *testing.T) {
	b := NewBreaker(BreakerPolicy{StallCalls: 5, StallFor: time.Minute}, t0)
	yes, no := true, false
	at := t0.Add(2 * time.Minute)
	// Edits that fail, or never report a result, are not progress.
	for i := 0; i < 4; i++ {
		id := string(rune('a' + i))
		b.Observe([]Event{{Kind: EvToolStart, Tool: "Edit", InputDigest: id, CallID: id}}, at)
		b.Observe([]Event{{Kind: EvToolEnd, Tool: "Edit", CallID: id, OK: &no}}, at)
	}
	v := b.Observe([]Event{{Kind: EvToolStart, Tool: "Edit", InputDigest: "e", CallID: "e"}}, at)
	if !strings.Contains(v.Trip, "no file change") {
		t.Fatalf("failed and unfinished edits must not reset the stall: %q", v.Trip)
	}

	b = NewBreaker(BreakerPolicy{StallCalls: 5, StallFor: time.Minute}, t0)
	for i := 0; i < 4; i++ {
		b.Observe([]Event{call("Grep", string(rune('a'+i)))}, at)
	}
	b.Observe([]Event{{Kind: EvToolStart, Tool: "Write", InputDigest: "w", CallID: "w"}}, at)
	b.Observe([]Event{{Kind: EvToolEnd, Tool: "Write", CallID: "w", OK: &yes}}, at)
	if v := b.Observe([]Event{call("Grep", "z")}, at); v.Trip != "" {
		t.Fatalf("a succeeded write is progress: %q", v.Trip)
	}
}

func TestTheBreakerSeesEventsAdmissionDrops(t *testing.T) {
	tripped := ""
	buf := &logBuffer{admit: NewAdmission(1, 1), breaker: NewBreaker(BreakerPolicy{RepeatTrip: 8}, t0),
		now: func() time.Time { return t0 }, onTrip: func(r string) { tripped = r }}
	for i := 0; i < 8; i++ {
		buf.addEvents([]Event{call("Bash", "same")})
	}
	if !strings.Contains(tripped, "8 times in a row") {
		t.Fatalf("a flood admission refuses must still trip the breaker: %q", tripped)
	}
}
