//go:build unix

package runner

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func checkoutFixture(t *testing.T) *CheckoutBinding {
	t.Helper()
	home, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// The daemon's own rule: a checkout lives in a non-dot folder under the home folder.
	t.Setenv("HOME", home)
	root := filepath.Join(home, "projects")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	base := filepath.Join(root, "repo")
	if err := os.Mkdir(base, 0o700); err != nil {
		t.Fatal(err)
	}
	git := func(dir string, args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(HostGitEnv(os.Environ()), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_SYSTEM="+os.DevNull)
		b, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s: %v", args, b, err)
		}
		return strings.TrimSpace(string(b))
	}
	git(base, "init", "-b", "main")
	git(base, "config", "user.name", "Test User")
	git(base, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(base, "project.txt"), []byte("before\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git(base, "add", "project.txt")
	git(base, "-c", "commit.gpgsign=false", "-c", "core.hooksPath="+os.DevNull, "commit", "-m", "fixture")
	path := filepath.Join(root, "selected-checkout")
	git(base, "worktree", "add", "-b", "cr/task", path)
	return &CheckoutBinding{Repo: "repo", Root: root, Path: path, Branch: "cr/task", Head: git(path, "rev-parse", "HEAD"), GitDir: git(path, "rev-parse", "--absolute-git-dir"), CommonDir: git(path, "rev-parse", "--path-format=absolute", "--git-common-dir")}
}

// This deterministic fixture writes relative to the launch directory.
const checkoutEditScript = "#!/bin/sh\nset -eu\nprintf 'after\\n' > project.txt\n"

func TestCheckoutAuthorLaunchAndCustody(t *testing.T) {
	binding := checkoutFixture(t)
	run := testRun("checkout-author", "author")
	run.Checkout = binding
	job := &Job{Run: run, Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("Edit project.txt")}, {Name: "FAKE.sh", ContentBase64: b64(checkoutEditScript)}}}
	prepRoot := t.TempDir()
	ws, err := Prepare(prepRoot, job)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.releaseCheckout()
	if ws.Dir != binding.Path {
		t.Fatalf("working directory = %q", ws.Dir)
	}
	if b, err := os.ReadFile(filepath.Join(binding.Path, "project.txt")); err != nil || string(b) != "before\n" {
		t.Fatalf("preparation changed the project: %q %v", b, err)
	}
	for _, runtime := range []string{RuntimeClaude, RuntimeCodex} {
		cmd, err := Command(runtime, run, ws, testPolicy(), SandboxPaths{Workspace: ws.Dir})
		if err != nil {
			t.Fatal(err)
		}
		if cmd.Dir != binding.Path || !strings.Contains(strings.Join(cmd.Args, " "), ws.Inputs) || !strings.Contains(strings.Join(cmd.Args, " "), ws.Out) {
			t.Fatalf("unbound launch: %v (%s)", cmd.Args, cmd.Dir)
		}
	}
	cmd, err := Command(RuntimeFake, run, ws, testPolicy(), SandboxPaths{Workspace: ws.Dir})
	if err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("fixture command: %v: %s", err, out)
	}
	if got, err := os.ReadFile(filepath.Join(binding.Path, "project.txt")); err != nil || string(got) != "after\n" {
		t.Fatalf("selected checkout was not edited: %q %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(binding.Root, "repo", "project.txt")); err != nil || string(got) != "before\n" {
		t.Fatalf("base checkout changed: %q %v", got, err)
	}
	other := *job
	other.Run.ID = "checkout-other"
	if next, err := Prepare(prepRoot, &other); err == nil {
		next.releaseCheckout()
		t.Fatal("two runs acquired the same checkout")
	}
	for _, role := range []string{"intake", "pre-check"} {
		other.Run.Role = role
		if _, err := prepareWorkspace(t.TempDir(), &other, claudeAdapter{}); err == nil {
			t.Fatalf("%s inherited author checkout", role)
		}
	}
}

func TestCheckoutRefusesChangedAndUnsafePaths(t *testing.T) {
	b := checkoutFixture(t)
	for _, mutate := range []func(*CheckoutBinding){
		func(b *CheckoutBinding) { b.Branch = "main" },
		func(b *CheckoutBinding) { b.Head = "changed" },
		func(b *CheckoutBinding) { b.Root = b.Path },
		func(b *CheckoutBinding) { b.CommonDir = filepath.Dir(b.Root) },
		func(b *CheckoutBinding) { b.Path = filepath.Join(b.Path, "missing") },
		func(b *CheckoutBinding) { b.Path = filepath.Dir(b.Path) },
	} {
		changed := *b
		mutate(&changed)
		if err := validateCheckout(&changed); err == nil {
			t.Fatalf("accepted invalid checkout: %+v", changed)
		}
	}
	linked := filepath.Join(b.Root, "linked")
	if err := os.Symlink(b.Path, linked); err != nil {
		t.Fatal(err)
	}
	changed := *b
	changed.Path = linked
	if err := validateCheckout(&changed); err == nil {
		t.Fatal("followed a checkout symlink")
	}
	if err := os.Rename(filepath.Join(b.Path, ".git"), filepath.Join(b.Path, "saved-gitfile")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(b.GitDir, filepath.Join(b.Path, ".git")); err != nil {
		t.Fatal(err)
	}
	if err := validateCheckout(b); err == nil {
		t.Fatal("followed a .git symlink")
	}
}

func TestCheckoutRefusesExistingRunDirectoryAndReleasesCustody(t *testing.T) {
	b := checkoutFixture(t)
	run := testRun("checkout-existing", "author")
	run.Checkout = b
	reserved := filepath.Join(b.Path, ".controlrod-run-"+run.ID)
	if err := os.Mkdir(reserved, 0o700); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(reserved, "keep.txt")
	if err := os.WriteFile(keep, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Prepare(t.TempDir(), &Job{Run: run}); err == nil {
		t.Fatal("reused an existing run directory")
	}
	if b, err := os.ReadFile(keep); err != nil || string(b) != "keep" {
		t.Fatal("existing directory was modified")
	}
	run.ID = "checkout-after-failure"
	ws, err := Prepare(t.TempDir(), &Job{Run: run})
	if err != nil {
		t.Fatal(err)
	}
	ws.releaseCheckout()
}

func TestDaemonRunsInBoundCheckout(t *testing.T) {
	b := checkoutFixture(t)
	run := testRun("checkout-e2e", "author")
	run.Checkout = b
	// A deterministic fixture process exercises daemon launch, not a model or its login.
	job := &Job{Run: run, Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("Edit project.txt")}, {Name: "FAKE.sh", ContentBase64: b64(checkoutEditScript)}}}
	job.Claim.LeaseExpiresAt = time.Now().Add(time.Hour).Format(time.RFC3339Nano)
	var logs bytes.Buffer
	d := New(Config{Home: t.TempDir(), Runtimes: []string{"fake"}, Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	comp, err := d.execute(context.Background(), job)
	if err != nil {
		t.Fatal(err)
	}
	if comp.Status != "succeeded" {
		t.Fatalf("%s: %s\n%s", comp.Status, comp.Error, logs.String())
	}
	if got, err := os.ReadFile(filepath.Join(b.Path, "project.txt")); err != nil || string(got) != "after\n" {
		t.Fatalf("selected checkout was not edited: %q %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(b.Root, "repo", "project.txt")); err != nil || string(got) != "before\n" {
		t.Fatal("base repository was modified")
	}
	if comp.Trace == nil || comp.Trace.Checkout == nil || *comp.Trace.Checkout != *b {
		t.Fatal("execution trace did not retain the verified checkout")
	}
	if f := comp.Trace.CheckoutFinal; f == nil || f.Branch != b.Branch || f.Head != b.Head {
		t.Fatalf("trace did not record the checkout read after the run: %+v", f)
	}
	for _, out := range comp.Outputs {
		if out.Name == "controlrod-checkout.json" {
			t.Fatal("checkout evidence leaked into the author outputs")
		}
	}
	if !strings.Contains(logs.String(), b.Path) {
		t.Fatal("run log omitted the effective checkout")
	}
	// The lock is released after execution, so a later run can use the checkout.
	lockPath, err := checkoutLockPath(d.cfg.Home, b)
	if err != nil {
		t.Fatal(err)
	}
	release, err := lockCheckout(lockPath)
	if err != nil {
		t.Fatal(err)
	}
	release()
}
