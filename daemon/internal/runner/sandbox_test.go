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
			Filesystem                                                                     struct{ DenyRead []string }
			Network                                                                        struct{ AllowedDomains []string }
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
	// The home folder is denied whole (Codex keeps the workspace inside it usable), and so is a
	// daemon home elsewhere; a denial inside a denied folder is dropped, since bubblewrap cannot
	// mount it and it adds nothing.
	for _, d := range []string{`"` + home + `"="deny"`, `"` + other + `"="deny"`, `":slash_tmp"="read"`, `":tmpdir"="read"`} {
		if !strings.Contains(joined, d) {
			t.Errorf("profile lacks %s: %s", d, joined)
		}
	}
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
	// Keys as TOML decodes them, in any spelling (bare, quoted, escaped, dotted, in a table), and
	// every other key that can loosen the sandbox.
	for line, key := range map[string]string{
		`  sandbox_mode = "danger-full-access"`: "sandbox_mode", `"sandbox_mode" = "x"`: "sandbox_mode", `'sandbox_mode' = 'x'`: "sandbox_mode",
		`"sandbox\u005fmode" = "x"`: "sandbox_mode", `[profiles.p]` + "\n" + `model = "x"`: "profiles", `web_search = "live"`: "web_search",
		`[features]` + "\n" + `apps = true`: "features", `[mcp_servers.x]` + "\n" + `command = "y"`: "mcp_servers",
		`approval_policy = "on-request"`: "approval_policy", `[x.y]` + "\n" + `sandbox_mode = "z"`: "x.y.sandbox_mode",
		`notify = ["python3", "out/notify.py"]`: "notify",
	} {
		managed := filepath.Join(t.TempDir(), "managed_config.toml")
		if err := os.WriteFile(managed, []byte("# sandbox_mode in a comment is fine\nmodel = \"x\"\n"+line+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, []string{managed}); err == nil || !strings.Contains(err.Error(), "sets "+key+",") {
			t.Fatalf("managed %q: %v", line, err)
		}
	}
	// A managed file with only harmless settings passes; one that is not valid TOML refuses.
	harmless := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(harmless, []byte("model = \"x\"\n# sandbox_mode = \"y\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, []string{harmless}); err != nil {
		t.Fatalf("harmless managed file: %v", err)
	}
	invalid := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(invalid, []byte("sandbox_mode = \n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, []string{invalid}); err == nil || !strings.Contains(err.Error(), "cannot be read as TOML") {
		t.Fatalf("broken managed file: %v", err)
	}
	// A managed file that exists but cannot be read is refused, not taken as absent.
	if os.Getuid() != 0 {
		locked := filepath.Join(t.TempDir(), "config.toml")
		if err := os.WriteFile(locked, []byte("x"), 0o000); err != nil {
			t.Fatal(err)
		}
		if err := Preflight(ctx, RuntimeCodex, signedIn, found, safe, []string{locked}); err == nil || !strings.Contains(err.Error(), "cannot be read as TOML") {
			t.Fatalf("unreadable managed file: %v", err)
		}
	}
	// A feature Control Rod has not qualified, left on by a new version.
	unknown := func(context.Context) (string, error) {
		return "shell_tool stable true\nteleport experimental true\n", nil
	}
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

func TestStagedRuntimesAreCopiedOutsideHomeAndRechecked(t *testing.T) {
	src := filepath.Join(t.TempDir(), "vendor", "x86_64")
	for _, d := range []string{"bin", "codex-path"} {
		if err := os.MkdirAll(filepath.Join(src, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(src, "bin", "codex"), []byte("\x7fELF codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "codex-path", "rg"), []byte("rg"), 0o755); err != nil {
		t.Fatal(err)
	}
	sum, files, err := treeDigest(src)
	if err != nil {
		t.Fatal(err)
	}
	a := RuntimeArtifact{Path: filepath.Join(src, "bin", "codex"), Root: src, Digest: Digest{Algorithm: "sha256", Value: sum}, exeSum: files["bin/codex"]}
	base := filepath.Join(t.TempDir(), "stage")
	got, err := StageArtifact(a, base)
	if err != nil {
		t.Fatal(err)
	}
	if got.Path != filepath.Join(base, sum, "bin", "codex") || got.Root != filepath.Join(base, sum) || got.Digest != a.Digest || got.exeSum != a.exeSum {
		t.Fatalf("staged %+v", got)
	}
	if fi, _ := os.Stat(base); fi.Mode().Perm() != 0o700 {
		t.Errorf("stage folder mode %v", fi.Mode().Perm())
	}
	// A staged copy that was changed is replaced, never launched.
	if err := os.WriteFile(got.Path, []byte("tampered"), 0o755); err != nil {
		t.Fatal(err)
	}
	again, err := StageArtifact(a, base)
	if err != nil || again.Digest != a.Digest {
		t.Fatalf("restage: %+v %v", again, err)
	}
	if b, _ := os.ReadFile(again.Path); string(b) != "\x7fELF codex" {
		t.Fatalf("tampered copy kept: %q", b)
	}
	// A stage folder others can read is refused.
	open := filepath.Join(t.TempDir(), "open")
	if err := os.MkdirAll(open, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := StageArtifact(a, open); err == nil {
		t.Fatal("staged into a folder others can read")
	}
}

func TestLoginLocationsFollowTheEnvironmentAndLinksAndAreDenied(t *testing.T) {
	home := t.TempDir()
	moved := t.TempDir()  // CODEX_HOME points here
	linked := t.TempDir() // ~/.claude is a link to here
	if err := os.WriteFile(filepath.Join(linked, ".credentials.json"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(linked, filepath.Join(home, ".claude")); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{"CODEX_HOME": moved}
	got := LoginLocations(func(k string) string { return env[k] }, home)
	for _, want := range []string{moved, linked, filepath.Join(linked, ".credentials.json")} {
		real, _ := filepath.EvalSymlinks(want)
		if !slices.Contains(got, real) {
			t.Errorf("login %s not found: %q", real, got)
		}
	}
	d := testPolicy().Denied(SandboxPaths{Home: home, Workspace: filepath.Join(home, "w"), Logins: got})
	real, _ := filepath.EvalSymlinks(linked)
	if !slices.Contains(d, real) {
		t.Fatalf("linked login not denied by its real path: %q", d)
	}
	// A login inside the workspace (or a workspace inside a login) refuses the launch.
	ws := workspaceWithTools(t, "Read\n")
	run := testRun("run-li", "author")
	for _, rt := range []string{RuntimeClaude, RuntimeCodex} {
		if _, err := Command(rt, run, ws, testPolicy(), SandboxPaths{Home: home, Workspace: ws.Dir, Logins: []string{filepath.Join(ws.Dir, "inputs")}}); !errors.Is(err, ErrLoginInWorkspace) {
			t.Errorf("%s: login inside the workspace: %v", rt, err)
		}
		if _, err := Command(rt, run, ws, testPolicy(), SandboxPaths{Home: home, Workspace: ws.Dir, Logins: []string{filepath.Dir(ws.Dir)}}); !errors.Is(err, ErrLoginInWorkspace) {
			t.Errorf("%s: workspace inside a login: %v", rt, err)
		}
	}
}

func TestPolicyShapesTheDaemonCannotEnforceAreRefused(t *testing.T) {
	p := testPolicy()
	p.WritableRoots = []string{"workspace", "/srv"}
	if _, err := VerifyPolicy(policyJob(t, p)); err == nil || !strings.Contains(err.Error(), "writable roots") {
		t.Fatalf("writable roots: %v", err)
	}
	p = testPolicy()
	p.EnabledTools = []string{"read", "teleport"}
	if _, err := VerifyPolicy(policyJob(t, p)); err == nil {
		t.Fatal("unknown tool accepted")
	}
	// Codex cannot drop its shell; Claude Code can run with fewer tools.
	p = testPolicy()
	p.EnabledTools = []string{"read"}
	if _, err := CodexPolicyArgs(p, SandboxPaths{Home: "/home/u", Workspace: "/home/u/w"}); err == nil {
		t.Fatal("codex ran without its shell tool")
	}
	if ClaudeToolList(p) != "Read" {
		t.Fatalf("claude tools %q", ClaudeToolList(p))
	}
}

func TestStagingConcurrentlyPublishesOneCopy(t *testing.T) {
	src := t.TempDir()
	if err := os.MkdirAll(filepath.Join(src, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "bin", "codex"), []byte("\x7fELF codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	sum, files, err := treeDigest(src)
	if err != nil {
		t.Fatal(err)
	}
	a := RuntimeArtifact{Path: filepath.Join(src, "bin", "codex"), Root: src, Digest: Digest{Algorithm: "sha256", Value: sum}, exeSum: files["bin/codex"]}
	base := filepath.Join(t.TempDir(), "stage")
	errs := make(chan error, 8)
	for range 8 {
		go func() { _, err := StageArtifact(a, base); errs <- err }()
	}
	for range 8 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent staging: %v", err)
		}
	}
	if b, err := os.ReadFile(filepath.Join(base, sum, "bin", "codex")); err != nil || string(b) != "\x7fELF codex" {
		t.Fatalf("published copy: %q %v", b, err)
	}
}

func TestStageRootIgnoresTMPDIR(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	if r := StageRoot(); !strings.HasPrefix(r, "/tmp/") && !strings.HasPrefix(r, "/private/tmp/") {
		t.Fatalf("stage root %s follows TMPDIR", r)
	}
}

func TestPreflightRefusesUnreadableFeatureListsAndUnqualifiedPlatforms(t *testing.T) {
	ctx := context.Background()
	signedIn := preflightRunner(map[string]int{"codex login status": 0})
	for _, list := range []string{"", "\n\n", "shell_tool stable true\nsomething else entirely\n"} {
		l := list
		got := func(context.Context) (string, error) { return l, nil }
		if err := Preflight(ctx, RuntimeCodex, signedIn, found, got, nil); err == nil {
			t.Errorf("feature list %q passed", list)
		}
	}
	old := platformCheck
	platformCheck = func() error { return errors.New("not qualified on macOS") }
	t.Cleanup(func() { platformCheck = old })
	if err := PreflightHost(RuntimeClaude, found, nil); err == nil || !strings.Contains(err.Error(), "not qualified") {
		t.Fatalf("unqualified platform: %v", err)
	}
	if err := PreflightHost(RuntimeFake, found, nil); err != nil {
		t.Fatalf("fake needs no platform: %v", err)
	}
}

func TestCredentialStoreLinksAreDeniedAtTheirTargets(t *testing.T) {
	home := t.TempDir()
	elsewhere := t.TempDir()
	keyElsewhere := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(keyElsewhere, []byte("k"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(elsewhere, filepath.Join(home, ".aws")); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(home, ".ssh"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(keyElsewhere, filepath.Join(home, ".ssh", "id_ed25519")); err != nil {
		t.Fatal(err)
	}
	p := testPolicy()
	p.DeniedRead = append(p.DeniedRead, "~/.aws")
	d := p.Denied(SandboxPaths{Home: home, Workspace: filepath.Join(home, "w")})
	for _, want := range []string{elsewhere, keyElsewhere} {
		real, _ := filepath.EvalSymlinks(want)
		if !slices.Contains(d, real) {
			t.Errorf("%s not denied: %q", real, d)
		}
	}
}
