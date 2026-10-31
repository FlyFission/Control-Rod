//go:build unix

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// startChild starts a process in its own group, as the daemon does, and reaps it in the background.
func startChild(t *testing.T, script string, dir string) (*exec.Cmd, chan struct{}) {
	t.Helper()
	cmd := exec.Command("bash", "-c", script)
	cmd.Dir = dir
	setProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exited) }()
	t.Cleanup(func() {
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-exited
	})
	return cmd, exited
}

func waitClosed(t *testing.T, ch <-chan struct{}, d time.Duration, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(d):
		t.Fatalf("timed out: %s", what)
	}
}

func TestReceiptMatchesOnlyTheProcessItWasMadeFor(t *testing.T) {
	cmd, exited := startChild(t, "sleep 30", t.TempDir())
	r, err := NewReceipt("run-a", "tok", cmd.Process.Pid, 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if !r.Matches() {
		t.Fatal("a fresh receipt must match its live process")
	}
	reused := r
	reused.ProcessStart = "1"
	if reused.Matches() {
		t.Fatal("a different start time is a different process (a reused id)")
	}
	reboot := r
	reboot.BootID = "another-boot"
	if reboot.Matches() {
		t.Fatal("a receipt from another boot never matches")
	}
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	waitClosed(t, exited, 5*time.Second, "child exit")
	if r.Matches() {
		t.Fatal("a receipt never matches a process that has exited and been reaped")
	}
}

func TestGracefulStopRevokesWriteBeforeAnySignal(t *testing.T) {
	ws := t.TempDir()
	if err := os.MkdirAll(filepath.Join(ws, "out"), 0o700); err != nil {
		t.Fatal(err)
	}
	// On SIGHUP the process tries to write; it must already be refused. Then it ignores HUP and only TERM ends it.
	script := `trap 'echo late > out/late.txt 2>/dev/null; echo tried > /dev/null' HUP; trap 'exit 0' TERM; echo ready > out/ready.txt; while true; do sleep 0.05; done`
	cmd, exited := startChild(t, script, ws)
	for i := 0; i < 100; i++ {
		if _, err := os.Stat(filepath.Join(ws, "out", "ready.txt")); err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	r, err := NewReceipt("run-b", "tok", cmd.Process.Pid, 1, ws)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	StopGracefully(r, StopTimings{AfterHangup: 300 * time.Millisecond, Grace: 5 * time.Second}, exited)
	waitClosed(t, exited, 5*time.Second, "exit after TERM")
	if time.Since(start) < 250*time.Millisecond {
		t.Fatal("TERM came before the pause after HUP")
	}
	if _, err := os.Stat(filepath.Join(ws, "out", "late.txt")); err == nil {
		t.Fatal("the process wrote to the workspace after write authority was revoked")
	}
	RestoreWrite(ws)
	if err := os.WriteFile(filepath.Join(ws, "out", "after.txt"), []byte("x"), 0o600); err != nil {
		t.Fatalf("write access was not restored: %v", err)
	}
}

func TestGracefulStopEndsWithKillForAProcessThatIgnoresTerm(t *testing.T) {
	cmd, exited := startChild(t, `trap '' HUP TERM; while true; do sleep 0.05; done`, t.TempDir())
	time.Sleep(100 * time.Millisecond)
	r, err := NewReceipt("run-c", "tok", cmd.Process.Pid, 1, "")
	if err != nil {
		t.Fatal(err)
	}
	StopGracefully(r, StopTimings{AfterHangup: 50 * time.Millisecond, Grace: 200 * time.Millisecond}, exited)
	waitClosed(t, exited, 5*time.Second, "exit after KILL")
}

func TestGracefulStopSignalsNothingWhenTheReceiptNoLongerMatches(t *testing.T) {
	cmd, exited := startChild(t, "sleep 30", t.TempDir())
	r, err := NewReceipt("run-d", "tok", cmd.Process.Pid, 1, "")
	if err != nil {
		t.Fatal(err)
	}
	r.ProcessStart = "1" // as if the id now belonged to another process
	StopGracefully(r, StopTimings{AfterHangup: 10 * time.Millisecond, Grace: 10 * time.Millisecond}, exited)
	select {
	case <-exited:
		t.Fatal("a process was signalled on a receipt that did not match it")
	case <-time.After(300 * time.Millisecond):
	}
}

func TestRestartedDaemonStopsVerifiedOrphansAndReportsThem(t *testing.T) {
	home := t.TempDir()
	ws := t.TempDir()
	orphan, exited := startChild(t, "sleep 30", ws)
	alive, err := NewReceipt("run-orphan", "claim-orphan", orphan.Process.Pid, 3, ws)
	if err != nil {
		t.Fatal(err)
	}
	// A receipt whose process is long gone (another start time): nothing to signal, only report.
	stale := alive
	stale.RunID, stale.ClaimToken, stale.ProcessStart = "run-stale", "claim-stale", "1"
	store := NewReceipts(home)
	for _, r := range []SpawnReceipt{alive, stale} {
		if err := store.Put(r); err != nil {
			t.Fatal(err)
		}
	}
	var mu sync.Mutex
	var reports []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/evidence") {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		b, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(b, &body)
		body["path"] = r.URL.Path
		mu.Lock()
		reports = append(reports, body)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(EvidenceReply{RunID: strings.Split(r.URL.Path, "/")[3], Reconciled: true})
	}))
	defer srv.Close()
	var logs bytes.Buffer
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Runtimes: []string{RuntimeFake},
		StopAfterHangup: 50 * time.Millisecond, StopGrace: time.Second, Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	d.sweepOrphans(context.Background())
	waitClosed(t, exited, 5*time.Second, "orphan stopped")
	mu.Lock()
	defer mu.Unlock()
	if len(reports) != 2 {
		t.Fatalf("want 2 reports, got %d: %s", len(reports), logs.String())
	}
	for _, rep := range reports {
		if rep["observation"] != "process-gone" || rep["claim_token"] == "" || rep["receipt"] == nil {
			t.Fatalf("bad report %v", rep)
		}
		if _, leaked := rep["receipt"].(map[string]any)["workspace"]; leaked {
			t.Fatal("the wire receipt must not carry local paths")
		}
	}
	if left, _ := store.List(); len(left) != 0 {
		t.Fatalf("reported receipts must be removed, %d left", len(left))
	}
}

func TestReceiptIsSentWithLogsUntilRecorded(t *testing.T) {
	home := t.TempDir()
	job := &Job{Run: testRun("run-receipt", "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64("sleep 0.3; echo done > out/x.txt")},
	}}
	job.Run.Generation = 2
	api, srv := newFakeAPI(t, job)
	var logs bytes.Buffer
	cancel, stopped := startDaemon(t, srv, home, time.Minute, &logs)
	api.wait(t, 1)
	cancel()
	<-stopped
	api.mu.Lock()
	defer api.mu.Unlock()
	var withReceipt int
	for _, b := range api.logs["run-receipt"] {
		if b.Receipt != nil {
			withReceipt++
			if b.Receipt.Generation != 2 || b.Receipt.PID <= 0 || b.Receipt.BootID == "" || b.Receipt.ProcessStart == "" {
				t.Fatalf("incomplete receipt %+v", b.Receipt)
			}
		}
	}
	if withReceipt != 1 {
		t.Fatalf("the receipt is sent until a log post succeeds, then never again; sent %d times", withReceipt)
	}
	if left, _ := NewReceipts(home).List(); len(left) != 0 {
		t.Fatal("the receipt must be removed once the exit is observed")
	}
}
