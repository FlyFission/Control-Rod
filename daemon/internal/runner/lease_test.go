package runner

import (
	"testing"
	"time"
)

func TestTheLeaseEndsAtTheEarlierOfTheAdvertisedEndAndThreeHeartbeatsFromSending(t *testing.T) {
	sent := time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)
	l := newLeaseClock(sent, sent.Add(time.Minute).Format(time.RFC3339Nano), 30*time.Second)
	if got := l.deadline(); !got.Equal(sent.Add(time.Minute)) {
		t.Fatalf("the advertised end, earlier than three heartbeats: %s", got)
	}
	l = newLeaseClock(sent, sent.Add(time.Hour).Format(time.RFC3339Nano), 30*time.Second)
	if got := l.deadline(); !got.Equal(sent.Add(90 * time.Second)) {
		t.Fatalf("never longer than three heartbeats from sending: %s", got)
	}
	if got := newLeaseClock(sent, "", 30*time.Second).deadline(); !got.Equal(sent.Add(90 * time.Second)) {
		t.Fatalf("no advertised end: %s", got)
	}
	// A renewal counts from when its request was sent, however late the answer came.
	l.renew(sent.Add(time.Minute), sent.Add(10*time.Minute).Format(time.RFC3339Nano))
	if got := l.deadline(); !got.Equal(sent.Add(time.Minute + 90*time.Second)) {
		t.Fatalf("renewed from the sending time: %s", got)
	}
	// A renewal never moves the end earlier.
	l.renew(sent, sent.Format(time.RFC3339Nano))
	if got := l.deadline(); !got.Equal(sent.Add(time.Minute + 90*time.Second)) {
		t.Fatalf("an older answer cannot shorten the lease: %s", got)
	}
}
