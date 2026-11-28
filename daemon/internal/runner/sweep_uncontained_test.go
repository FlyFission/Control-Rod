//go:build unix

package runner

import (
	"context"
	"encoding/json"
	"fmt"
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

// A run left by an earlier daemon that will not stop is retried less and less often, and after a
// few tries the control plane is told, once, that its processes remain (review DMN-10, #178).
func TestASweepThatCannotStopARunBacksOffAndReportsIt(t *testing.T) {
	dir := t.TempDir()
	cmd := exec.Command("bash", "-c", `sleep 30 & echo $! > child.pid; sleep 0.3`)
	cmd.Dir = dir
	setProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	waitFile(t, filepath.Join(dir, "child.pid"))
	r, err := NewReceipt("run-stuck", "tok-stuck", cmd.Process.Pid, 1, Unit{Mode: ContainGroup})
	if err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()
	b, _ := os.ReadFile(filepath.Join(dir, "child.pid"))
	var child int
	_, _ = fmt.Sscan(strings.TrimSpace(string(b)), &child)
	defer syscall.Kill(child, syscall.SIGKILL)

	home := t.TempDir()
	if err := NewReceipts(home).Put(r); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var observations []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		var body struct {
			Observation string `json:"observation"`
		}
		raw, _ := io.ReadAll(req.Body)
		_ = json.Unmarshal(raw, &body)
		mu.Lock()
		observations = append(observations, body.Observation)
		mu.Unlock()
		_, _ = w.Write([]byte(`{"run_id":"run-stuck","reconciled":false}`))
	}))
	defer srv.Close()
	oldKill := killWait
	killWait = 50 * time.Millisecond
	defer func() { killWait = oldKill }()
	var logs safeBuffer
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Runtimes: []string{RuntimeFake}, OutboxInterval: 20 * time.Millisecond,
		RetryLimit: time.Hour, StopAfterHangup: 10 * time.Millisecond, StopGrace: 10 * time.Millisecond,
		Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	deadline := time.Now().Add(3 * time.Second)
	passes := 0
	for time.Now().Before(deadline) {
		d.sweepOrphans(context.Background())
		passes++
		time.Sleep(5 * time.Millisecond)
	}
	tries := strings.Count(logs.String(), "would not stop")
	if tries < uncontainedAfter || tries > 10 || tries*4 > passes {
		t.Fatalf("%d tries in %d passes: the retries did not back off", tries, passes)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(observations) != 1 || observations[0] != ObservationProcessesRemain {
		t.Fatalf("observations %v", observations)
	}
	if syscall.Kill(child, 0) != nil {
		t.Fatal("a member of a leaderless group was signalled")
	}
}
