package main

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// The daemon stops by itself once the launcher that started it is no longer its parent.
func TestStopWhenLauncherGone(t *testing.T) {
	var ppid atomic.Int64
	ppid.Store(4242)
	ctx := stopWhenLauncherGone(context.Background(), "4242", func() int { return int(ppid.Load()) })
	select {
	case <-ctx.Done():
		t.Fatal("stopped while the launcher is still the parent")
	case <-time.After(1500 * time.Millisecond):
	}
	ppid.Store(1)
	select {
	case <-ctx.Done():
	case <-time.After(3 * time.Second):
		t.Fatal("did not stop after the launcher went away")
	}
	for _, v := range []string{"", "x", "1", "0"} {
		if c := stopWhenLauncherGone(context.Background(), v, func() int { return 9 }); c != context.Background() {
			t.Fatalf("launcher pid %q should leave the context alone", v)
		}
	}
}
