//go:build unix

package runner

import (
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
	"testing"
	"time"
)

func authorCheckoutJob(t *testing.T, id string, b *CheckoutBinding, script string) *Job {
	t.Helper()
	run := testRun(id, "author")
	run.Checkout = b
	job := &Job{Run: run, Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("Edit project.txt")}, {Name: "FAKE.sh", ContentBase64: b64(script)}}}
	job.Claim.LeaseExpiresAt = time.Now().Add(time.Hour).Format(time.RFC3339Nano)
	return job
}

func quietDaemon(t *testing.T) *Daemon {
	t.Helper()
	return New(Config{Home: t.TempDir(), Runtimes: []string{"fake"}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
}

// The run directory sits in the agent-writable checkout. An agent that swaps it for a link to a
// folder the sandbox denies must not get that folder's files captured as outputs.
func TestCheckoutCaptureRefusesLinkedRunDirectory(t *testing.T) {
	b := checkoutFixture(t)
	ws, err := Prepare(t.TempDir(), &Job{Run: func() Run { r := testRun("link-run", "author"); r.Checkout = b; return r }()})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.releaseCheckout()
	secret := filepath.Join(t.TempDir(), "denied")
	for _, d := range []string{"out", "inputs"} {
		if err := os.MkdirAll(filepath.Join(secret, d), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(secret, d, "token"), []byte("secret"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(ws.Out, "ok.txt"), []byte("fine"), 0o600); err != nil {
		t.Fatal(err)
	}
	if c, err := ws.CaptureRun(ws.Out, MaxOutputFile, MaxOutputTotal); err != nil || len(c.Files) != 1 {
		t.Fatalf("honest outputs refused: %v", err)
	}
	reserved := filepath.Dir(ws.Out)
	if err := os.RemoveAll(reserved); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, reserved); err != nil {
		t.Fatal(err)
	}
	for _, dir := range []string{ws.Out, ws.Inputs} {
		// Capture holds the directory this run created, so a link put in its place is not read.
		c, err := ws.CaptureRun(dir, MaxOutputFile, MaxOutputTotal)
		if c != nil && len(c.Files) != 0 {
			t.Fatalf("captured through a linked run directory: %+v %v", c.Files, err)
		}
	}
}

func TestCheckoutHostContainment(t *testing.T) {
	home := t.TempDir()
	home, _ = filepath.EvalSymlinks(home)
	d := filepath.Join(home, ".controlrod")
	at := SandboxPaths{Home: home, DaemonHome: d, Logins: []string{filepath.Join(home, ".codex"), filepath.Join(home, ".claude"), "/elsewhere/login"}}
	p := testPolicy()
	p.DeniedRead = append(p.DeniedRead, "~/Documents")
	bind := func(root, path string) *CheckoutBinding {
		return &CheckoutBinding{Repo: "r", Root: root, Path: path, Branch: "b", Head: "h"}
	}
	good := bind(filepath.Join(home, "projects"), filepath.Join(home, "projects", ".worktrees", "r", "b"))
	if err := validateCheckoutHost(good, at, p); err != nil {
		t.Fatalf("refused a checkout in the home folder: %v", err)
	}
	for name, b := range map[string]*CheckoutBinding{
		"outside home":              bind("/srv/projects", "/srv/projects/r"),
		"home itself as root":       bind(home, filepath.Join(home, "r")),
		"dot folder root":           bind(filepath.Join(home, ".hidden"), filepath.Join(home, ".hidden", "r")),
		"ssh folder":                bind(filepath.Join(home, ".ssh"), filepath.Join(home, ".ssh", "r")),
		"daemon home":               bind(filepath.Join(d, "work"), filepath.Join(d, "work", "r")),
		"daemon home inside root":   bind(home+"/projects", home+"/projects/r"),
		"login folder":              bind(filepath.Join(home, ".codex"), filepath.Join(home, ".codex", "r")),
		"denied folder":             bind(filepath.Join(home, "Documents"), filepath.Join(home, "Documents", "r")),
		"parent of a denied folder": bind(filepath.Join(home, "projects"), filepath.Join(home, "Documents")),
		"path escapes by name":      bind(filepath.Join(home, "projects"), home+"-other/r"),
	} {
		at2, p2 := at, p
		if name == "daemon home inside root" {
			at2.DaemonHome = filepath.Join(home, "projects", "r", "daemon")
		}
		if err := validateCheckoutHost(b, at2, p2); err == nil {
			t.Errorf("%s: accepted %+v", name, b)
		}
	}
}

// Realistic Home, DaemonHome and Logins reach the daemon: a checkout under the daemon's home or a
// login folder is refused before anything is written there.
func TestDaemonRefusesCheckoutOverProtectedFolders(t *testing.T) {
	b := checkoutFixture(t) // HOME is the fixture's home
	home := filepath.Dir(b.Root)
	d := New(Config{Home: filepath.Join(b.Root, "daemon-home"), Runtimes: []string{"fake"}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	comp, err := d.execute(context.Background(), authorCheckoutJob(t, "over-daemon-home", b, checkoutEditScript))
	if err != nil || comp.Status != "failed" || !strings.Contains(comp.Error, "checkout refused") {
		t.Fatalf("a checkout under the daemon's home ran: %+v %v", comp, err)
	}
	login := filepath.Join(b.Root, "codex-login")
	if err := os.Mkdir(login, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_HOME", login)
	d2 := quietDaemon(t)
	comp, err = d2.execute(context.Background(), authorCheckoutJob(t, "over-login", b, checkoutEditScript))
	if err != nil || comp.Status != "failed" || !strings.Contains(comp.Error, "checkout refused") {
		t.Fatalf("a checkout over a login folder ran: %+v %v", comp, err)
	}
	t.Setenv("CODEX_HOME", "")
	t.Setenv("HOME", filepath.Join(home, "elsewhere"))
	comp, err = d2.execute(context.Background(), authorCheckoutJob(t, "outside-home", b, checkoutEditScript))
	if err != nil || comp.Status != "failed" || !strings.Contains(comp.Error, "checkout refused") {
		t.Fatalf("a checkout outside the home folder ran: %+v %v", comp, err)
	}
	if _, err := os.Lstat(filepath.Join(b.Path, ".controlrod-run-outside-home")); err == nil {
		t.Fatal("a refused checkout was written to")
	}
}

func TestCheckoutRefusesGitAdministrationInsideTheCheckout(t *testing.T) {
	b := checkoutFixture(t)
	base := *b
	base.Path = filepath.Join(b.Root, "repo") // the base clone keeps .git inside the writable tree
	base.GitDir = filepath.Join(base.Path, ".git")
	base.CommonDir = base.GitDir
	base.Branch = "main"
	if out, err := checkoutGit(base.Path, "rev-parse", "HEAD"); err != nil {
		t.Fatal(err)
	} else {
		base.Head = out
	}
	if err := validateCheckout(&base); err == nil || !strings.Contains(err.Error(), "linked worktrees") {
		t.Fatalf("bound a clone whose .git is writable: %v", err)
	}
	if err := validateCheckout(b); err != nil {
		t.Fatalf("refused a linked worktree: %v", err)
	}
}

func TestCheckoutLockLivesOutsideTheCheckout(t *testing.T) {
	b := checkoutFixture(t)
	home := t.TempDir()
	path, err := checkoutLockPath(home, b)
	if err != nil {
		t.Fatal(err)
	}
	if within(path, b.Path) || within(path, b.GitDir) || within(path, b.CommonDir) || !within(path, home) {
		t.Fatalf("lock %s is in agent-writable space", path)
	}
	job := authorCheckoutJob(t, "lock-1", b, checkoutEditScript)
	ws, err := Prepare(home, job)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.releaseCheckout()
	// An agent unlinks every lock-looking file it can reach.
	for _, root := range []string{b.Path, b.GitDir} {
		_ = filepath.WalkDir(root, func(p string, e os.DirEntry, err error) error {
			if err == nil && strings.HasSuffix(p, ".lock") {
				_ = os.Remove(p)
			}
			return nil
		})
	}
	job.Run.ID = "lock-2"
	if next, err := Prepare(home, job); err == nil {
		next.releaseCheckout()
		t.Fatal("custody was lost when the agent removed files in the checkout")
	}
}

// When a run's processes cannot be confirmed gone, the checkout stays in custody.
func TestUncontainedRunKeepsCheckoutCustody(t *testing.T) {
	if _, err := exec.LookPath("perl"); err != nil {
		t.Skip("needs perl to leave a process behind")
	}
	b := checkoutFixture(t)
	pidFile := filepath.Join(t.TempDir(), "pid")
	script := "#!/bin/sh\nperl -MPOSIX -e 'POSIX::setsid(); open(F,\">" + pidFile + "\"); print F $$; close(F); exec \"sleep\",\"30\"' &\nsleep 1\nexit 0\n"
	d := quietDaemon(t)
	t.Cleanup(func() {
		if raw, err := os.ReadFile(pidFile); err == nil {
			_ = exec.Command("kill", strings.TrimSpace(string(raw))).Run()
		}
	})
	_, err := d.execute(context.Background(), authorCheckoutJob(t, "uncontained", b, script))
	if !errors.Is(err, ErrUncontained) {
		t.Skipf("this host contained the escaped process (%v)", err)
	}
	lockPath, perr := checkoutLockPath(d.cfg.Home, b)
	if perr != nil {
		t.Fatal(perr)
	}
	if release, lerr := lockCheckout(lockPath); lerr == nil {
		release()
		t.Fatal("custody was released while processes may survive")
	}
}

func TestCheckoutBeforeStartRefusesHeadDrift(t *testing.T) {
	b := checkoutFixture(t)
	job := authorCheckoutJob(t, "drift", b, checkoutEditScript)
	ws, err := Prepare(t.TempDir(), job)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.releaseCheckout()
	if err := ws.beforeStartCheck(); err != nil {
		t.Fatalf("an unchanged checkout was refused: %v", err)
	}
	if err := os.WriteFile(filepath.Join(b.Path, "drift.txt"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{{"add", "drift.txt"}, {"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + os.DevNull, "commit", "-m", "drift"}} {
		cmd := exec.Command("git", args...)
		cmd.Dir = b.Path
		cmd.Env = append(HostGitEnv(os.Environ()), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_SYSTEM="+os.DevNull)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %s %v", args, out, err)
		}
	}
	marker := filepath.Join(t.TempDir(), "started")
	cmd := exec.Command("sh", "-c", "echo hi > "+marker)
	setProcessGroup(cmd)
	err = Execute(context.Background(), cmd, func(string) {}, ExecHooks{BeforeStart: ws.beforeStartCheck})
	if err == nil || !strings.Contains(err.Error(), "HEAD changed") {
		t.Fatalf("started on a moved HEAD: %v", err)
	}
	if _, serr := os.Stat(marker); serr == nil {
		t.Fatal("the process ran")
	}
}

func TestCheckoutRunDirectoryIsRemovedWithCustody(t *testing.T) {
	b := checkoutFixture(t)
	comp, err := quietDaemon(t).execute(context.Background(), authorCheckoutJob(t, "cleanup", b, checkoutEditScript))
	if err != nil || comp.Status != "succeeded" {
		t.Fatalf("%+v %v", comp, err)
	}
	if _, err := os.Lstat(filepath.Join(b.Path, ".controlrod-run-cleanup")); !os.IsNotExist(err) {
		t.Fatalf("the run directory was left in the checkout: %v", err)
	}
}

func TestClaimAdvertisesCheckoutSupportOnlyWhereCustodyWorks(t *testing.T) {
	var got ClaimRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	_, _ = NewClient(srv.URL, "t").Claim(context.Background(), []string{"fake"}, nil, 0, nil)
	if got.SupportsCheckouts != checkoutCustodySupported() {
		t.Fatalf("advertised %v, custody is %v", got.SupportsCheckouts, checkoutCustodySupported())
	}
	release, err := lockCheckout(filepath.Join(t.TempDir(), "probe.lock"))
	if (err == nil) != got.SupportsCheckouts {
		t.Fatalf("the claim says %v but taking a lock gave %v", got.SupportsCheckouts, err)
	}
	if err == nil {
		release()
	}
}

func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + os.DevNull}, args...)...)
	cmd.Dir = dir
	cmd.Env = append(HostGitEnv(os.Environ()), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_SYSTEM="+os.DevNull)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %s %v", args, out, err)
	}
	return strings.TrimSpace(string(out))
}

// A staging directory that is a link to somewhere else must not receive the daemon's writes.
func TestCheckoutStagingNeverWritesThroughLinks(t *testing.T) {
	b := checkoutFixture(t)
	outside := t.TempDir()
	run := filepath.Join(b.Path, ".controlrod-run-stage")
	if err := os.Mkdir(run, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(run, "inputs")); err != nil {
		t.Fatal(err)
	}
	rr, err := os.OpenRoot(run)
	if err != nil {
		t.Fatal(err)
	}
	defer rr.Close()
	in := []NamedFile{{Name: "BRIEF.md"}, {Name: "sub/FAKE.sh"}}
	if err := stageCheckoutInputs(rr, in, [][]byte{[]byte("a"), []byte("b")}); err == nil {
		t.Fatal("staged through a linked inputs directory")
	}
	// A real inputs directory whose subdirectory was swapped for a link.
	_ = os.Remove(filepath.Join(run, "inputs"))
	if err := os.Mkdir(filepath.Join(run, "inputs"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(run, "inputs", "sub")); err != nil {
		t.Fatal(err)
	}
	if err := stageCheckoutInputs(rr, in, [][]byte{[]byte("a"), []byte("b")}); err == nil {
		t.Fatal("staged through a linked input subdirectory")
	}
	if left, _ := os.ReadDir(outside); len(left) != 0 {
		t.Fatalf("the daemon wrote outside the run directory: %v", left)
	}
}

// A capture holds the directory it opened: replacing that path afterwards cannot redirect reads.
func TestCaptureReadsThePinnedDirectoryNotTheSwappedPath(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "out")
	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sub", "f.txt"), []byte("mine"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outside, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "sub", "f.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	r, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if err := os.Rename(dir, dir+"-moved"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, dir); err != nil {
		t.Fatal(err)
	}
	c, err := captureRoot(r, MaxOutputFile, MaxOutputTotal)
	if err != nil || len(c.Files) != 1 || string(c.Raw["sub/f.txt"]) != "mine" {
		t.Fatalf("capture followed the swapped path: %+v %v", c, err)
	}
	// And through the path, a link is refused outright.
	if _, err := Capture(dir, MaxOutputFile, MaxOutputTotal); err == nil {
		t.Fatal("captured a linked output root")
	}
}

func TestCheckoutAfterRun(t *testing.T) {
	b := checkoutFixture(t)
	obs, err := checkoutAfterRun(b)
	if err != nil || obs.Branch != b.Branch || obs.Head != b.Head {
		t.Fatalf("unchanged checkout: %+v %v", obs, err)
	}
	// The author committing on the bound branch is what the run is for.
	gitIn(t, b.Path, "commit", "--allow-empty", "-m", "work")
	obs, err = checkoutAfterRun(b)
	if err != nil || obs.Head == b.Head {
		t.Fatalf("a commit on the bound branch was refused or unseen: %+v %v", obs, err)
	}
	// Rewinding below the bound commit is not a descendant.
	moved := *b
	moved.Head = gitIn(t, b.Path, "rev-parse", "HEAD")
	gitIn(t, b.Path, "reset", "--hard", "-q", "HEAD~1")
	if obs, err = checkoutAfterRun(&moved); err == nil || obs == nil || obs.Head == moved.Head {
		t.Fatalf("a rewound HEAD was accepted: %+v %v", obs, err)
	}
	// Another branch, and a detached HEAD.
	gitIn(t, b.Path, "checkout", "-q", "-b", "other")
	if obs, err = checkoutAfterRun(b); err == nil || obs == nil || obs.Branch != "other" {
		t.Fatalf("a switched branch was accepted: %+v %v", obs, err)
	}
	gitIn(t, b.Path, "checkout", "-q", "--detach")
	if _, err = checkoutAfterRun(b); err == nil {
		t.Fatal("a detached HEAD was accepted")
	}
}

func TestRunThatMovesTheBranchFailsAndTraceRecordsWhatWasFound(t *testing.T) {
	b := checkoutFixture(t)
	comp, err := quietDaemon(t).execute(context.Background(), authorCheckoutJob(t, "switcher", b, "#!/bin/sh\nset -eu\ngit checkout -q -b elsewhere\nprintf 'x\\n' > project.txt\n"))
	if err != nil {
		t.Fatal(err)
	}
	if comp.Status != "failed" || !strings.Contains(comp.Error, "branch changed") {
		t.Fatalf("a run that left the bound branch passed: %s %q", comp.Status, comp.Error)
	}
	if comp.Trace == nil || comp.Trace.CheckoutFinal == nil || comp.Trace.CheckoutFinal.Branch != "elsewhere" || comp.Trace.Checkout.Branch != b.Branch {
		t.Fatalf("trace did not separate the requested binding from what was found: %+v", comp.Trace)
	}
}

func TestRunThatCommitsOnTheBoundBranchPasses(t *testing.T) {
	b := checkoutFixture(t)
	script := "#!/bin/sh\nset -eu\nprintf 'after\\n' > project.txt\ngit add project.txt\ngit -c user.name=a -c user.email=a@example.com -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m work\n"
	comp, err := quietDaemon(t).execute(context.Background(), authorCheckoutJob(t, "committer", b, script))
	if err != nil || comp.Status != "succeeded" {
		t.Fatalf("%+v %v", comp, err)
	}
	if f := comp.Trace.CheckoutFinal; f == nil || f.Head == b.Head || f.Branch != b.Branch {
		t.Fatalf("trace: %+v", f)
	}
}

// An ancestor swapped for a link after validation must not redirect reservation: the daemon opened
// the checkout once and compares that handle with what the path names.
func TestCheckoutAncestorSwappedAfterValidationIsRefused(t *testing.T) {
	b := checkoutFixture(t)
	elsewhere := filepath.Join(filepath.Dir(b.Root), "elsewhere")
	if err := os.MkdirAll(filepath.Join(elsewhere, filepath.Base(b.Path)), 0o700); err != nil {
		t.Fatal(err)
	}
	moved := b.Root + "-moved"
	testHookAfterCheckoutValidated = func() {
		testHookAfterCheckoutValidated = nil
		if err := os.Rename(b.Root, moved); err != nil {
			t.Error(err)
			return
		}
		if err := os.Symlink(elsewhere, b.Root); err != nil {
			t.Error(err)
		}
	}
	t.Cleanup(func() { testHookAfterCheckoutValidated = nil })
	job := authorCheckoutJob(t, "swap-ancestor", b, checkoutEditScript)
	ws, err := Prepare(t.TempDir(), job)
	if err == nil {
		ws.releaseCheckout()
		t.Fatal("prepared a checkout whose ancestor was swapped after validation")
	}
	if left, _ := os.ReadDir(filepath.Join(elsewhere, filepath.Base(b.Path))); len(left) != 0 {
		t.Fatalf("the daemon wrote through the swapped ancestor: %v", left)
	}
	if left, _ := os.ReadDir(moved); len(left) == 0 {
		t.Fatal("the original checkout vanished")
	}
}

func TestCheckoutAfterRunReportsNothingWhenIdentityIsUnconfirmed(t *testing.T) {
	b := checkoutFixture(t)
	if err := os.Rename(filepath.Join(b.Path, ".git"), filepath.Join(b.Path, "saved-gitfile")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(b.GitDir, filepath.Join(b.Path, ".git")); err != nil {
		t.Fatal(err)
	}
	obs, err := checkoutAfterRun(b)
	if err == nil || obs != nil {
		t.Fatalf("recorded branch and HEAD from an unconfirmed checkout: %+v %v", obs, err)
	}
}

// A link put where the reserved run directory should be must not receive the staged inputs, even
// when it points inside the checkout.
func TestCheckoutRunDirectorySwappedForLinkIsRefused(t *testing.T) {
	b := checkoutFixture(t)
	notes := filepath.Join(b.Path, "notes")
	if err := os.Mkdir(notes, 0o700); err != nil {
		t.Fatal(err)
	}
	run := filepath.Join(b.Path, ".controlrod-run-swap-run")
	testHookAfterRunDirCreated = func() {
		testHookAfterRunDirCreated = nil
		if err := os.Remove(run); err != nil {
			t.Error(err)
			return
		}
		if err := os.Symlink("notes", run); err != nil {
			t.Error(err)
		}
	}
	t.Cleanup(func() { testHookAfterRunDirCreated = nil })
	ws, err := Prepare(t.TempDir(), authorCheckoutJob(t, "swap-run", b, checkoutEditScript))
	if err == nil {
		ws.releaseCheckout()
		t.Fatal("staged into a swapped run directory")
	}
	if left, _ := os.ReadDir(notes); len(left) != 0 {
		t.Fatalf("inputs landed in the checkout outside the run directory: %v", left)
	}
}

func TestCheckoutBeforeStartRefusesAPathSwappedAfterPreparation(t *testing.T) {
	b := checkoutFixture(t)
	ws, err := Prepare(t.TempDir(), authorCheckoutJob(t, "path-swap", b, checkoutEditScript))
	if err != nil {
		t.Fatal(err)
	}
	defer ws.releaseCheckout()
	if err := ws.checkoutStillSame(); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(b.Path, b.Path+"-moved"); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(b.Path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := ws.checkoutStillSame(); err == nil {
		t.Fatal("a directory swapped in after preparation was accepted")
	}
}
