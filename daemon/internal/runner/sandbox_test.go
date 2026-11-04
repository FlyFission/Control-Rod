//go:build unix

package runner

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/flyfission/control-rod/daemon/internal/digest"
)

// testPolicy is the control plane's no-network policy shape (services/api/src/sandbox.ts).
func testPolicy() *SandboxPolicy {
	return &SandboxPolicy{ID: "sbp_none-test", Version: 3, OrgID: "org_test", Driver: DriverNativeCLI,
		DeniedRead:    []string{"~", "~/.claude", "~/.codex", "~/.ssh", "~/.controlrod", "/mnt"},
		WritableRoots: []string{"workspace"}, AllowedHosts: []string{},
		EnabledTools:    []string{"command", "read", "edit", "write", "search"},
		MandatoryClaims: []string{"agent actions have no network"}}
}

func testPaths(ws *Workspace) SandboxPaths {
	return SandboxPaths{Home: "/home/u", DaemonHome: "/home/u/.controlrod", Workspace: ws.Dir}
}

// policyJob is a job carrying p as the control plane sends it, with matching digests.
func policyJob(t *testing.T, p *SandboxPolicy) Job {
	t.Helper()
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	sum, err := digest.CanonicalSHA256(raw)
	if err != nil {
		t.Fatal(err)
	}
	d := Digest{Algorithm: "sha256", Value: sum}
	run := testRun("run-p", "author")
	run.SandboxPolicy = &PolicyRef{ID: p.ID, Version: p.Version, Digest: d}
	return Job{Run: run, SandboxPolicyRaw: raw, SandboxPolicyDigest: &d}
}

func TestVerifyPolicyAcceptsOnlyThePolicyTheRunCites(t *testing.T) {
	job := policyJob(t, testPolicy())
	got, err := VerifyPolicy(job)
	if err != nil || got.ID != "sbp_none-test" || got.Version != 3 {
		t.Fatalf("verify: %+v %v", got, err)
	}
	// No policy at all: refused, never an unsandboxed start.
	if _, err := VerifyPolicy(Job{Run: testRun("r", "author")}); !errors.Is(err, ErrNoPolicy) {
		t.Fatalf("missing policy: %v", err)
	}
	// One byte changed after the control plane digested it.
	tampered := job
	tampered.SandboxPolicyRaw = []byte(strings.Replace(string(job.SandboxPolicyRaw), `"/mnt"`, `"/mnx"`, 1))
	if _, err := VerifyPolicy(tampered); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("tampered policy: %v", err)
	}
	// The run cites another version.
	other := policyJob(t, testPolicy())
	other.Run.SandboxPolicy.Version = 2
	if _, err := VerifyPolicy(other); err == nil {
		t.Fatal("a policy the run does not cite was accepted")
	}
	// A driver this daemon does not run, and a policy that denies nothing.
	for _, edit := range []func(*SandboxPolicy){func(p *SandboxPolicy) { p.Driver = "oci" }, func(p *SandboxPolicy) { p.DeniedRead = []string{} }} {
		p := testPolicy()
		edit(p)
		if _, err := VerifyPolicy(policyJob(t, p)); err == nil {
			t.Fatalf("accepted %+v", p)
		}
	}
}

func TestDeniedExpandsHomeAndAlwaysAddsTheDaemonHome(t *testing.T) {
	p := testPolicy()
	got := p.Denied(SandboxPaths{Home: "/home/u", DaemonHome: "/srv/cr", Workspace: "/srv/cr/work/r1"})
	want := []string{"/home/u", "/home/u/.claude", "/home/u/.codex", "/home/u/.ssh", "/home/u/.controlrod", "/mnt", "/srv/cr"}
	if !slices.Equal(got, want) {
		t.Fatalf("denied\n got %q\nwant %q", got, want)
	}
}

func TestClaudeSettingsConfineReadsAndKeepTheWorkspaceOpen(t *testing.T) {
	ws := &Workspace{Dir: "/home/u/.controlrod/work/WP-1/r0/author-1-r1"}
	p := testPolicy()
	p.AllowedHosts = []string{"geo.dot.gov"}
	var s struct {
		Sandbox struct {
			Enabled, FailIfUnavailable, AllowUnsandboxedCommands, AutoAllowBashIfSandboxed bool
			Filesystem                                                                 struct{ DenyRead []string }
			Network                                                                    struct{ AllowedDomains []string }
		}
		Permissions struct {
			DefaultMode                         string
			BlockReadsOutsideWorkingDirectories bool
			Deny                                []string
		}
	}
	if err := json.Unmarshal([]byte(ClaudeSettings(p, testPaths(ws), "")), &s); err != nil {
		t.Fatal(err)
	}
	if !s.Sandbox.Enabled || !s.Sandbox.FailIfUnavailable || s.Sandbox.AllowUnsandboxedCommands || s.Sandbox.AutoAllowBashIfSandboxed {
		t.Errorf("sandbox switches %+v", s.Sandbox)
	}
	if !s.Permissions.BlockReadsOutsideWorkingDirectories || s.Permissions.DefaultMode != "acceptEdits" {
		t.Errorf("permissions %+v", s.Permissions)
	}
	// Denials containing the workspace (home, the daemon home) would close the workspace too:
	// they are left to blockReadsOutsideWorkingDirectories. Every other denial is named twice.
	if slices.Contains(s.Sandbox.Filesystem.DenyRead, "/home/u") || slices.Contains(s.Sandbox.Filesystem.DenyRead, "/home/u/.controlrod") {
		t.Errorf("a denial closes the workspace: %q", s.Sandbox.Filesystem.DenyRead)
	}
	for _, d := range []string{"/home/u/.claude", "/home/u/.codex", "/home/u/.ssh", "/mnt"} {
		if !slices.Contains(s.Sandbox.Filesystem.DenyRead, d) || !slices.Contains(s.Permissions.Deny, "Read(/"+d+"/**)") || !slices.Contains(s.Permissions.Deny, "Edit(/"+d+"/**)") {
			t.Errorf("%s not denied: %q %q", d, s.Sandbox.Filesystem.DenyRead, s.Permissions.Deny)
		}
	}
	if !slices.Equal(s.Sandbox.Network.AllowedDomains, []string{"geo.dot.gov"}) {
		t.Errorf("network %q", s.Sandbox.Network.AllowedDomains)
	}
	// No hooks unless the run records permission requests.
	if strings.Contains(ClaudeSettings(testPolicy(), testPaths(ws), ""), "hooks") {
		t.Error("hooks without a hook file")
	}
}

func TestCodexProfileDeniesTheOutermostPathsAndSwitchesOffUnqualifiedFeatures(t *testing.T) {
	home := t.TempDir()
	for _, d := range []string{".claude", ".ssh", ".controlrod/work/WP-1/r0/author-1-r1"} {
		if err := os.MkdirAll(filepath.Join(home, d), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	ws := &Workspace{Dir: filepath.Join(home, ".controlrod/work/WP-1/r0/author-1-r1")}
	other := t.TempDir() // a daemon home outside the home folder is denied on its own
	args, err := CodexPolicyArgs(testPolicy(), SandboxPaths{Home: home, DaemonHome: other, Workspace: ws.Dir})
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	for _, d := range []string{`"` + home + `"="deny"`, `"` + other + `"="deny"`, `":slash_tmp"="read"`, `":tmpdir"="read"`} {
		if !strings.Contains(joined, d) {
			t.Errorf("profile lacks %s: %s", d, joined)
		}
	}
	// Inside a denied folder, a denial adds nothing and would stop Codex's sandbox from starting.
	if strings.Contains(joined, `.claude"="deny"`) || strings.Contains(joined, `.ssh"="deny"`) {
		t.Errorf("nested denials passed: %s", joined)
	}
	for _, f := range CodexDisabledFeatures {
		if !strings.Contains(joined, "--disable "+f) {
			t.Errorf("feature %s left on", f)
		}
	}
	for _, f := range CodexDisabledFeatures {
		if slices.Contains(CodexSafeFeatures, f) {
			t.Errorf("%s is both safe and switched off", f)
		}
	}
}

func TestAgentEnvKeepsOnlyTheAllowlist(t *testing.T) {
	got := AgentEnv([]string{"HOME=/home/u", "PATH=/usr/bin:/mnt/c/Windows/System32:/mnt:/home/u/.local/bin", "LANG=C.UTF-8", "LC_ALL=C",
		"ANTHROPIC_API_KEY=sk", "OPENAI_API_KEY=sk", "AWS_SECRET_ACCESS_KEY=x", "GH_TOKEN=x", "SSH_AUTH_SOCK=/run/ssh", "DBUS_SESSION_BUS_ADDRESS=x",
		"XDG_RUNTIME_DIR=/run/user/1000", "HTTPS_PROXY=http://p", "CONTROLROD_DAEMON_TOKEN=t", "DOCKER_HOST=unix:///x", "CODEX_HOME=/home/u/.codex"})
	want := []string{"HOME=/home/u", "PATH=/usr/bin:/home/u/.local/bin", "LANG=C.UTF-8", "LC_ALL=C", "CODEX_HOME=/home/u/.codex"}
	if !slices.Equal(got, want) {
		t.Fatalf("env\n got %q\nwant %q", got, want)
	}
}

func preflightRunner(answers map[string]int) CommandRunner {
	return func(_ context.Context, name string, args ...string) (string, int, error) {
		code, ok := answers[name+" "+strings.Join(args, " ")]
		if !ok {
			return "", 1, nil
		}
		return "", code, nil
	}
}

func found(string) (string, error) { return "/usr/bin/x", nil }

func TestPreflightRefusesWithTheFixAndNeverFallsBack(t *testing.T) {
	ctx := context.Background()
	signedIn := preflightRunner(map[string]int{"claude auth status": 0, "codex login status": 0})
	safe := func(context.Context) (string, error) {
		return "shell_tool stable true\nhooks stable false\nsteer removed true\ninstant_interrupt under development true\n", nil
	}
	if err := Preflight(ctx, RuntimeClaude, signedIn, found, safe, nil); err != nil {
		t.Fatalf("claude ready host: %v", err)
	}
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, nil); err != nil {
		t.Fatalf("codex ready host: %v", err)
	}
	if err := Preflight(ctx, RuntimeFake, nil, nil, nil, nil); err != nil {
		t.Fatalf("fake: %v", err)
	}
	var pe *PreflightError
	// Not signed in: the fix is the CLI's own login.
	err := Preflight(ctx, RuntimeClaude, preflightRunner(nil), found, safe, nil)
	if !errors.As(err, &pe) || !strings.Contains(err.Error(), "Run `claude login`") {
		t.Fatalf("claude signed out: %v", err)
	}
	if err := Preflight(ctx, RuntimeCodex, preflightRunner(nil), found, safe, nil); err == nil || !strings.Contains(err.Error(), "Run `codex login`") {
		t.Fatalf("codex signed out: %v", err)
	}
	// A missing sandbox program, on Linux.
	if runtime.GOOS == "linux" {
		missing := func(p string) (string, error) {
			if p == "socat" {
				return "", errors.New("no")
			}
			return "/usr/bin/" + p, nil
		}
		if err := Preflight(ctx, RuntimeClaude, signedIn, missing, safe, nil); err == nil || !strings.Contains(err.Error(), "sudo apt install socat") {
			t.Fatalf("missing socat: %v", err)
		}
		if err := Preflight(ctx, RuntimeCodex, signedIn, missing, safe, nil); err != nil {
			t.Fatalf("codex does not need socat: %v", err)
		}
	}
	// A managed config that sets sandbox_mode, named by line.
	managed := filepath.Join(t.TempDir(), "managed_config.toml")
	if err := os.WriteFile(managed, []byte("# managed\nmodel = \"x\"\n  sandbox_mode = \"danger-full-access\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, []string{managed}); err == nil || !strings.Contains(err.Error(), "line 3") {
		t.Fatalf("managed sandbox_mode: %v", err)
	}
	// A feature Control Rod has not qualified, left on by a new version.
	unknown := func(context.Context) (string, error) { return "shell_tool stable true\nteleport experimental true\n", nil }
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, unknown, nil); err == nil || !strings.Contains(err.Error(), "teleport") {
		t.Fatalf("unqualified feature: %v", err)
	}
	broken := func(context.Context) (string, error) { return "", errors.New("exit 2") }
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, broken, nil); err == nil {
		t.Fatal("an unreadable feature list passed")
	}
}

// The installed Codex, when there is one, must leave on only features Control Rod has qualified once
// its switches are applied: this is the per-version check the preflight runs.
func TestInstalledCodexLeavesOnlyQualifiedFeatures(t *testing.T) {
	if _, err := exec.LookPath("codex"); err != nil {
		t.Skip("codex is not installed here")
	}
	list, err := CodexEffectiveFeatures(context.Background())
	if err != nil {
		t.Skipf("codex features list did not run here: %v", err)
	}
	if extra := unqualifiedCodexFeatures(list); len(extra) > 0 {
		t.Fatalf("the installed Codex leaves unqualified features on: %v", extra)
	}
}
