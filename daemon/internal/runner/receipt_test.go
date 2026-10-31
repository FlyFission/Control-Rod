//go:build unix

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

var fast = StopTimings{AfterHangup: 200 * time.Millisecond, Grace: 500 * time.Millisecond}

// startUnit starts a script in a containment unit of the given mode and records its receipt.
func startUnit(t *testing.T, k Container, runID, script, dir string) (SpawnReceipt, *exec.Cmd) {
	t.Helper()
	return startUnitNS(t, k, "testns", runID, script, dir)
}

func startUnitNS(t *testing.T, k Container, ns, runID, script, dir string) (SpawnReceipt, *exec.Cmd) {
	t.Helper()
	cmd := exec.Command("bash", "-c", script)
	cmd.Dir = dir
	unit := UnitName(ns, runID, 1)
	k.Wrap(cmd, unit)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	go func() { _ = cmd.Wait() }()
	u, err := k.Locate(cmd.Process.Pid, unit)
	if err != nil {
		t.Fatal(err)
	}
	r, err := NewReceipt(runID, "tok", cmd.Process.Pid, 1, u)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if r.Alive() {
			r.kill()
			waitGone(r, 5*time.Second)
		}
	})
	return r, cmd
}

func cgroupMode(t *testing.T) Container {
	t.Helper()
	k := DetectContainer(os.Getenv)
	if k.Mode != ContainCgroup {
		t.Skip("cgroup containment needs Linux with a systemd user manager")
	}
	return k
}

func waitFile(t *testing.T, p string) {
	t.Helper()
	for i := 0; i < 250; i++ {
		if _, err := os.Stat(p); err == nil {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("%s never appeared", p)
}

func TestReceiptMatchesOnlyItsOwnLiveProcess(t *testing.T) {
	r, _ := startUnit(t, Container{Mode: ContainGroup}, "run-a", "sleep 30", t.TempDir())
	if !r.Matches() || !r.Alive() {
		t.Fatal("a fresh receipt must match its live process")
	}
	reused, reboot := r, r
	reused.ProcessStart, reboot.BootID = "1", "another-boot"
	if reused.Matches() || reboot.Matches() {
		t.Fatal("another start time or boot is another process")
	}
	r.kill()
	if !waitGone(r, 5*time.Second) || r.Matches() {
		t.Fatal("a receipt never matches a process that has exited")
	}
}

func TestAZombieDoesNotCountAsRunning(t *testing.T) {
	cmd := exec.Command("bash", "-c", "exit 0")
	setProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Wait() }()
	r, err := NewReceipt("run-z", "tok", cmd.Process.Pid, 1, Unit{Mode: ContainGroup})
	if err != nil {
		t.Fatal(err)
	}
	// Not reaped yet: the process is a zombie as soon as it exits.
	for i := 0; i < 100 && r.Matches(); i++ {
		time.Sleep(20 * time.Millisecond)
	}
	if r.Matches() || r.Alive() {
		t.Fatal("an exited, unreaped process is not running and its run is not alive")
	}
}

func TestProcessGroupStopEndsWithKillForAProcessThatIgnoresTerm(t *testing.T) {
	r, _ := startUnit(t, Container{Mode: ContainGroup}, "run-c", `trap '' HUP TERM; while true; do sleep 0.05; done`, t.TempDir())
	time.Sleep(100 * time.Millisecond)
	if !StopGracefully(r, fast, nil) || r.Alive() {
		t.Fatal("the group must be gone after the ladder")
	}
}

func TestStopSignalsNothingWhenTheLeaderNoLongerMatches(t *testing.T) {
	r, cmd := startUnit(t, Container{Mode: ContainGroup}, "run-d", "sleep 30", t.TempDir())
	stale := r
	stale.ProcessStart, stale.BootID = "1", "another-boot"
	StopGracefully(stale, StopTimings{AfterHangup: 10 * time.Millisecond, Grace: 10 * time.Millisecond}, nil)
	if syscall.Kill(cmd.Process.Pid, 0) != nil {
		t.Fatal("a process was signalled on a receipt from another boot")
	}
}

func TestCgroupStopEndsChildrenThatEscapeTheGroupAndIgnoreSignals(t *testing.T) {
	k := cgroupMode(t)
	dir := t.TempDir()
	// The leader exits on HUP; its child leaves the process group (setsid), ignores signals and
	// drops the output pipes. The cgroup still holds it.
	script := `setsid bash -c 'trap "" HUP TERM; exec >/dev/null 2>&1; echo $$ > child.pid; while true; do sleep 0.05; done' & while [ ! -s child.pid ]; do sleep 0.02; done; trap 'exit 0' HUP; while true; do sleep 0.05; done`
	r, _ := startUnit(t, k, "run-escape", script, dir)
	waitFile(t, filepath.Join(dir, "child.pid"))
	if !StopGracefully(r, fast, nil) {
		t.Fatal("the stop did not finish")
	}
	if r.Alive() {
		t.Fatal("the escaped child survived: the run is not over until its unit is empty")
	}
}

func TestStopFreezesTheRunAndOnlyTheSnapshotCounts(t *testing.T) {
	k := cgroupMode(t)
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	if err := os.MkdirAll(out, 0o700); err != nil {
		t.Fatal(err)
	}
	// Keeps writing through an already open descriptor, as an agent with a file open would.
	script := `exec 3>>out/log.txt; trap 'echo after-stop >&3; exit 0' HUP; i=0; while true; do echo $i >&3; i=$((i+1)); sleep 0.01; done`
	r, _ := startUnit(t, k, "run-freeze", script, dir)
	waitFile(t, filepath.Join(out, "log.txt"))
	time.Sleep(100 * time.Millisecond)
	var captured *Captured
	if !StopGracefully(r, fast, func() {
		c, err := Capture(out, MaxOutputFile, MaxOutputTotal)
		if err != nil {
			t.Error(err)
		}
		captured = c
	}) {
		t.Fatal("the stop did not finish")
	}
	snap := captured.Raw["log.txt"]
	live, _ := os.ReadFile(filepath.Join(out, "log.txt"))
	if strings.Contains(string(snap), "after-stop") || !strings.Contains(string(live), "after-stop") {
		t.Fatal("writes after write authority ended must be on disk only, never in the capture")
	}
	if !bytes.HasPrefix(live, snap) {
		t.Fatal("the capture is the output exactly as it stood when the run was frozen")
	}
}

func TestExecuteEndsProcessesTheLeaderLeftBehind(t *testing.T) {
	for _, k := range []Container{{Mode: ContainGroup}, DetectContainer(os.Getenv)} {
		dir := t.TempDir()
		cmd := exec.Command("bash", "-c", `(sleep 60) & echo started; exit 0`)
		cmd.Dir = dir
		unit := UnitName("testns", "run-linger-"+k.Mode, 1)
		k.Wrap(cmd, unit)
		var receipt SpawnReceipt
		done := make(chan error, 1)
		go func() {
			done <- Execute(context.Background(), cmd, func(string) {}, ExecHooks{Linger: 200 * time.Millisecond, Timings: fast,
				Started: func(pid int) (*SpawnReceipt, error) {
					u, err := k.Locate(pid, unit)
					if err != nil {
						return nil, err
					}
					r, err := NewReceipt("run-linger", "tok", pid, 1, u)
					receipt = r
					return &r, err
				}})
		}()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("%s: %v", k.Mode, err)
			}
		case <-time.After(15 * time.Second):
			t.Fatalf("%s: a background process holding the pipes kept the run from ending", k.Mode)
		}
		if receipt.Alive() {
			t.Fatalf("%s: the leader's background process survived the run", k.Mode)
		}
	}
}

func TestExecuteFailsClosedWhenTheRunCannotBeOwned(t *testing.T) {
	dir := t.TempDir()
	cmd := exec.Command("bash", "-c", `echo $$ > leader.pid; sleep 30`)
	cmd.Dir = dir
	setProcessGroup(cmd)
	err := Execute(context.Background(), cmd, func(string) {}, ExecHooks{Started: func(int) (*SpawnReceipt, error) {
		waitFile(t, filepath.Join(dir, "leader.pid"))
		return nil, errors.New("disk full")
	}})
	if err == nil || !strings.Contains(err.Error(), "could not be owned") {
		t.Fatalf("got %v", err)
	}
	if syscall.Kill(cmd.Process.Pid, 0) == nil {
		t.Fatal("an unowned run must not keep running")
	}
}

func TestRestartedDaemonStopsOrphansReportsThemAndEndsUnreceiptedScopes(t *testing.T) {
	home := t.TempDir()
	k := DetectContainer(os.Getenv)
	alive, _ := startUnit(t, k, "run-orphan", "sleep 30", t.TempDir())
	alive.ClaimToken = "claim-orphan"
	gone := alive
	gone.RunID, gone.ClaimToken, gone.ProcessStart, gone.Unit, gone.Cgroup, gone.PGID = "run-stale", "claim-stale", "1", UnitName("x", "none", 1), "/nonexistent", 0
	gone.Containment = ContainGroup
	store := NewReceipts(home)
	for _, r := range []SpawnReceipt{alive, gone} {
		if err := store.Put(r); err != nil {
			t.Fatal(err)
		}
	}
	var unreceipted, foreign SpawnReceipt
	if k.Mode == ContainCgroup {
		unreceipted, _ = startUnitNS(t, k, Namespace(home), "run-noreceipt", "sleep 30", t.TempDir())
		// Another daemon's run (another home, another namespace) must never be touched.
		foreign, _ = startUnitNS(t, k, Namespace(t.TempDir()), "run-foreign", "sleep 30", t.TempDir())
	}
	var mu sync.Mutex
	var reports []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(b, &body)
		mu.Lock()
		reports = append(reports, body)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(EvidenceReply{RunID: strings.Split(r.URL.Path, "/")[3], Reconciled: true})
	}))
	defer srv.Close()
	var logs bytes.Buffer
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Runtimes: []string{RuntimeFake}, Container: &k,
		StopAfterHangup: 50 * time.Millisecond, StopGrace: time.Second, Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	d.sweepOrphans(context.Background())
	if alive.Alive() {
		t.Fatal("the orphan must be stopped")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reports) != 2 {
		t.Fatalf("want 2 reports, got %d: %s", len(reports), logs.String())
	}
	for _, rep := range reports {
		rc := rep["receipt"].(map[string]any)
		if rep["observation"] != "process-gone" || rep["claim_token"] == "" || rc["containment"] == "" {
			t.Fatalf("bad report %v", rep)
		}
		if _, leaked := rc["cgroup"]; leaked {
			t.Fatal("the wire receipt must not carry local paths")
		}
	}
	if left, _ := store.List(); len(left) != 0 {
		t.Fatalf("reported receipts must be removed, %d left", len(left))
	}
	if k.Mode == ContainCgroup && unreceipted.Alive() {
		t.Fatal("a run scope with no receipt must be ended by the sweep")
	}
	if k.Mode == ContainCgroup && !foreign.Alive() {
		t.Fatal("a scope from another daemon's namespace was ended")
	}
}

func TestReceiptIsSentWithLogsUntilRecordedAndKeptUntilTheOutbox(t *testing.T) {
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
			if b.Receipt.Generation != 2 || b.Receipt.PID <= 0 || b.Receipt.BootID == "" || b.Receipt.ProcessStart == "" || b.Receipt.Containment == "" {
				t.Fatalf("incomplete receipt %+v", b.Receipt)
			}
		}
	}
	if withReceipt != 1 {
		t.Fatalf("the receipt is sent until a log post succeeds, then never again; sent %d times", withReceipt)
	}
	if left, _ := NewReceipts(home).List(); len(left) != 0 {
		t.Fatal("the receipt must be removed once the completion is in the outbox")
	}
}

func TestCaptureEnforcesLimitsWhileReadingAndRefusesSymlinks(t *testing.T) {
	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "r.md"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	c, err := Capture(src, MaxOutputFile, MaxOutputTotal)
	if err != nil || string(c.Raw["r.md"]) != "x" || len(c.Files) != 1 {
		t.Fatalf("capture %+v %v", c, err)
	}
	// A huge sparse file is refused after reading just past the limit, never read whole.
	big, err := os.Create(filepath.Join(src, "huge.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if err := big.Truncate(8 << 30); err != nil {
		t.Fatal(err)
	}
	big.Close()
	start := time.Now()
	if _, err := Capture(src, MaxOutputFile, MaxOutputTotal); err == nil || !strings.Contains(err.Error(), "over the") {
		t.Fatalf("got %v", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("the capture read far past the limit")
	}
	if err := os.Remove(filepath.Join(src, "huge.bin")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(src, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := Capture(src, MaxOutputFile, MaxOutputTotal); err == nil {
		t.Fatal("a symlink in the outputs must be refused")
	}
}

func TestUnreadableCgroupStateCountsAsAlive(t *testing.T) {
	dir := t.TempDir()
	if populated(filepath.Join(dir, "gone")) {
		t.Fatal("a cgroup that no longer exists is empty")
	}
	ev := filepath.Join(dir, "cgroup.events")
	if err := os.WriteFile(ev, []byte("populated 0\nfrozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if populated(dir) {
		t.Fatal("populated 0 is empty")
	}
	if err := os.WriteFile(ev, []byte("frozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !populated(dir) {
		t.Fatal("an answer without the populated field is not proof of empty")
	}
	if os.Getuid() != 0 {
		if err := os.Chmod(ev, 0); err != nil {
			t.Fatal(err)
		}
		if !populated(dir) {
			t.Fatal("an unreadable cgroup counts as populated")
		}
	}
}

func TestExecuteReportsUncontainedWhenTheUnitWillNotEmpty(t *testing.T) {
	old := killWait
	killWait = 300 * time.Millisecond
	defer func() { killWait = old }()
	// A unit that claims to hold processes forever: the stop cannot be confirmed.
	fakeUnit := t.TempDir()
	if err := os.WriteFile(filepath.Join(fakeUnit, "cgroup.events"), []byte("populated 1\nfrozen 1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("bash", "-c", "sleep 30")
	setProcessGroup(cmd)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(200 * time.Millisecond); cancel() }()
	err := Execute(ctx, cmd, func(string) {}, ExecHooks{Timings: StopTimings{AfterHangup: 50 * time.Millisecond, Grace: 50 * time.Millisecond}, Linger: 100 * time.Millisecond,
		Started: func(pid int) (*SpawnReceipt, error) {
			return &SpawnReceipt{RunID: "run-u", Containment: ContainCgroup, Cgroup: fakeUnit, PGID: pid}, nil
		}})
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	if !errors.Is(err, ErrUncontained) {
		t.Fatalf("got %v, want ErrUncontained", err)
	}
}

func TestFallbackSignalsNothingOnAStaleReceiptEvenWhileItsGroupNumberExists(t *testing.T) {
	r, cmd := startUnit(t, Container{Mode: ContainGroup}, "run-stale-group", "sleep 30", t.TempDir())
	stale := r
	stale.ProcessStart = "1"
	if err := stale.signal(syscall.SIGTERM); !errors.Is(err, errNoIdentityToSignal) {
		t.Fatalf("got %v", err)
	}
	if syscall.Kill(cmd.Process.Pid, 0) != nil {
		t.Fatal("the group was signalled on the strength of its number alone")
	}
}

func TestOneDaemonPerHome(t *testing.T) {
	home := t.TempDir()
	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if _, err := LockHome(home); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("a second daemon on the same home must refuse: %v", err)
	}
}

func TestAReceiptWriteFailureEndsTheWholeUnitIncludingEscapedChildren(t *testing.T) {
	k := cgroupMode(t)
	dir := t.TempDir()
	cmd := exec.Command("bash", "-c", `setsid bash -c 'trap "" HUP TERM; exec >/dev/null 2>&1; echo $$ > child.pid; sleep 60' & while [ ! -s child.pid ]; do sleep 0.02; done; sleep 60`)
	cmd.Dir = dir
	unit := UnitName("testns", "run-nodisk", 1)
	k.Wrap(cmd, unit)
	var located SpawnReceipt
	err := Execute(context.Background(), cmd, func(string) {}, ExecHooks{Started: func(pid int) (*SpawnReceipt, error) {
		u, lerr := k.Locate(pid, unit)
		if lerr != nil {
			return nil, lerr
		}
		waitFile(t, filepath.Join(dir, "child.pid"))
		r, rerr := NewReceipt("run-nodisk", "tok", pid, 1, u)
		if rerr != nil {
			return nil, rerr
		}
		located = r
		return &r, errors.New("disk full")
	}})
	if err == nil || !strings.Contains(err.Error(), "could not be owned") {
		t.Fatalf("got %v", err)
	}
	if located.Alive() {
		t.Fatal("the escaped child survived a receipt failure")
	}
}
