package runner

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func writeFiles(t *testing.T, dir string, names ...string) {
	t.Helper()
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestSetupStepsFollowTheLockfilesAndNeverRunProjectScripts(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml", "package-lock.json", "uv.lock", "go.sum", "Cargo.lock")
	steps := SetupSteps(dir)
	var got []string
	for _, s := range steps {
		got = append(got, s.Lockfile)
		js := s.Bin == "pnpm" || s.Bin == "npm" || s.Bin == "bun"
		if js && !slices.Contains(s.Args, "--ignore-scripts") {
			t.Errorf("%s runs the project's scripts outside the sandbox: %v", s.Bin, s.Args)
		}
		if s.Bin == "uv" && !slices.Contains(s.Args, "--no-build") {
			t.Errorf("uv may build code from the checkout: %v", s.Args)
		}
	}
	// One JavaScript install only, and pnpm wins over a stray package-lock.json.
	if want := []string{"pnpm-lock.yaml", "uv.lock", "go.sum", "Cargo.lock"}; !slices.Equal(got, want) {
		t.Fatalf("steps %v, want %v", got, want)
	}
	if SetupSteps(t.TempDir()) != nil {
		t.Fatal("a folder with no lockfile has setup steps")
	}
}

func TestSetupStepsIgnoreALockfileThatIsALink(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "real.yaml")
	if err := os.Symlink(filepath.Join(dir, "real.yaml"), filepath.Join(dir, "pnpm-lock.yaml")); err != nil {
		t.Fatal(err)
	}
	if s := SetupSteps(dir); s != nil {
		t.Fatalf("a linked lockfile chose steps: %v", s)
	}
}

func TestSetupDirectiveTurnsSetupOffAndIsNotATool(t *testing.T) {
	dir := t.TempDir()
	ws := &Workspace{Inputs: dir}
	if !SetupWanted(ws) {
		t.Fatal("setup is off with no TOOLS.txt")
	}
	if err := os.WriteFile(filepath.Join(dir, "TOOLS.txt"), []byte("Read\nSetup: OFF\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if SetupWanted(ws) {
		t.Fatal("setup still on after the directive")
	}
	if tools, _ := readTools(ws); !slices.Equal(tools, []string{"Read"}) {
		t.Fatalf("the directive reached the tool list: %v", tools)
	}
}

func TestPrepareCheckoutNeverBlocksAndSaysWhatHappened(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml", "go.sum", "Cargo.lock")
	var ran []string
	run := func(_ context.Context, d string, s SetupStep) ([]byte, error) {
		if d != dir {
			t.Errorf("ran in %s", d)
		}
		ran = append(ran, s.Bin)
		switch s.Bin {
		case "pnpm":
			return []byte("ERR_PNPM_FETCH_404 left-pad"), errors.New("exit status 1")
		case "go":
			return nil, errSetupToolMissing
		}
		return nil, nil
	}
	events := PrepareCheckout(context.Background(), dir, run, time.Now)
	if !slices.Equal(ran, []string{"pnpm", "go", "cargo"}) {
		t.Fatalf("ran %v", ran)
	}
	if len(events) != 3 {
		t.Fatalf("%d notices, want one per step: %v", len(events), events)
	}
	for i, want := range []string{"failed", "not installed", "installed from Cargo.lock"} {
		if events[i].Kind != EvNotice || !strings.Contains(events[i].Text, want) {
			t.Errorf("notice %d = %q, want it to say %q", i, events[i].Text, want)
		}
	}
	if !strings.Contains(events[0].Text, "ERR_PNPM_FETCH_404") {
		t.Errorf("the failure does not show the tool's output: %q", events[0].Text)
	}
}

func TestPrepareCheckoutSkipsAnInstallThatAlreadyRan(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml")
	if err := os.Mkdir(filepath.Join(dir, "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	run := func(context.Context, string, SetupStep) ([]byte, error) {
		t.Fatal("ran again in a worktree that already has its packages")
		return nil, nil
	}
	if ev := PrepareCheckout(context.Background(), dir, run, time.Now); len(ev) != 0 {
		t.Fatalf("notices for a skipped step: %v", ev)
	}
}

func TestPrepareCheckoutStopsWithTheRun(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "go.sum", "Cargo.lock")
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	run := func(c context.Context, _ string, _ SetupStep) ([]byte, error) {
		calls++
		cancel()
		return nil, c.Err()
	}
	ev := PrepareCheckout(ctx, dir, run, time.Now)
	if calls != 1 || len(ev) != 1 || !strings.Contains(ev[0].Text, "stopped") {
		t.Fatalf("calls %d, notices %v", calls, ev)
	}
}

func TestRealSetupStepKeepsTheDaemonSecretsOut(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CONTROLROD_DAEMON_TOKEN", "secret")
	out, err := runSetupStep(context.Background(), dir, SetupStep{Bin: "env"})
	if err != nil {
		t.Skip("no env tool:", err)
	}
	if strings.Contains(string(out), "CONTROLROD_") {
		t.Fatal("the setup step saw the daemon's variables")
	}
	if !strings.Contains(string(out), "CI=1") {
		t.Fatal("the setup step can prompt")
	}
	if _, err := runSetupStep(context.Background(), dir, SetupStep{Bin: "no-such-tool-controlrod"}); !errors.Is(err, errSetupToolMissing) {
		t.Fatalf("missing tool gave %v", err)
	}
}
