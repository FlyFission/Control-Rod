package runner

import (
	"strings"
	"testing"
	"time"
)

func call(tool, digest string) Event { return Event{Kind: EvToolStart, Tool: tool, InputDigest: digest, Summary: "Run: x"} }

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
