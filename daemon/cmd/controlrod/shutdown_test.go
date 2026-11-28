package main

import (
	"os"
	"slices"
	"sync"
	"syscall"
	"testing"
	"time"
)

// The first signal starts a graceful stop; a second exits at once (review DMN-20).
func TestASecondSignalStopsAtOnce(t *testing.T) {
	sigs := make(chan os.Signal, 2)
	var mu sync.Mutex
	var said []string
	exited := make(chan int, 1)
	ctx, stop := shutdownContextOn(sigs, false, func(s string) { mu.Lock(); said = append(said, s); mu.Unlock() }, func(code int) { exited <- code })
	defer stop()
	sigs <- syscall.SIGHUP
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("the first signal did not start a stop")
	}
	select {
	case <-exited:
		t.Fatal("one signal exited at once")
	case <-time.After(50 * time.Millisecond):
	}
	sigs <- os.Interrupt
	select {
	case code := <-exited:
		if code != 130 {
			t.Fatalf("exit %d", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the second signal did not exit")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(said) != 2 {
		t.Fatalf("said %q", said)
	}
}

func TestAClosedTerminalStopsTheDaemon(t *testing.T) {
	if !slices.Contains(shutdownSignals, os.Signal(syscall.SIGHUP)) {
		t.Fatal("SIGHUP does not stop the daemon")
	}
}
