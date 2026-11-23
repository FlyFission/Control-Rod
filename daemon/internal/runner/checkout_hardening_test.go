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
		c, err := ws.CaptureRun(dir, MaxOutputFile, MaxOutputTotal)
		if !errors.Is(err, ErrLinkedRunPath) || c != nil {
			t.Fatalf("captured through a linked run directory: %v %v", c, err)
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
