//go:build unix

package runner

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/authprobe"
	"github.com/flyfission/control-rod/daemon/internal/binaryutil"
)

func TestAdaptersExposeBinarySpecAndRespectAgentEnv(t *testing.T) {
	for _, a := range RegisteredAdapters() {
		spec := SpecForAdapter(a)
		if spec.Label == "" || !slices.Contains(spec.Names, a.Binary()) {
			t.Fatalf("%s invalid BinarySpec: %+v", a.ID(), spec)
		}
	}

	root := t.TempDir()
	home := filepath.Join(root, "home")
	localBin := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(localBin, 0o755); err != nil {
		t.Fatal(err)
	}
	claudeBin := filepath.Join(localBin, "claude")
	if err := os.WriteFile(claudeBin, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	a, ok := AdapterFor(RuntimeClaude)
	if !ok {
		t.Fatal("claude adapter missing")
	}
	got, err := ResolveAdapterBinary(context.Background(), a, []string{
		"HOME=" + home,
		"PATH=/mnt/c/Windows/System32:/usr/bin",
		"ANTHROPIC_API_KEY=sk-ant-should-not-matter",
	})
	if err != nil {
		t.Fatalf("ResolveAdapterBinary failed: %v", err)
	}
	if got != claudeBin {
		t.Fatalf("ResolveAdapterBinary = %q, want %q", got, claudeBin)
	}
}

func TestExecRunnerAugmentsNodePATHSurgicallyWithoutLoginShellEnv(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home")
	cliDir := filepath.Join(root, "cli-bin")
	nvmBin := filepath.Join(home, ".nvm", "versions", "node", "v22.5.0", "bin")
	if err := os.MkdirAll(cliDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(nvmBin, 0o755); err != nil {
		t.Fatal(err)
	}

	// Synthetic node binary that runs sh on the target script and prints env keys.
	nodeShim := filepath.Join(nvmBin, "node")
	if err := os.WriteFile(nodeShim, []byte("#!/bin/sh\nexec /bin/sh \"$@\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	// Synthetic #!/usr/bin/env node script (note: /usr/bin/env is used, and NVM is NOT on PATH).
	cliPath := filepath.Join(cliDir, "synthetic-node-cli")
	scriptBody := "#!/usr/bin/env node\necho \"ok-version\"\nenv\n"
	if err := os.WriteFile(cliPath, []byte(scriptBody), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", cliDir+":/usr/bin:/bin")
	t.Setenv("ANTHROPIC_API_KEY", "sk-secret-must-not-forward")
	t.Setenv("LOGIN_SHELL_VAR", "must-not-forward")

	out, code, err := ExecRunner(context.Background(), "synthetic-node-cli", "--version")
	if err != nil || code != 0 {
		t.Fatalf("ExecRunner failed: code=%d err=%v out=%q", code, err, out)
	}
	if !strings.Contains(out, "ok-version") {
		t.Fatalf("expected output from synthetic node script, got %q", out)
	}
	if strings.Contains(out, "sk-secret-must-not-forward") || strings.Contains(out, "LOGIN_SHELL_VAR") {
		t.Fatalf("ExecRunner leaked non-allowlisted environment variables: %q", out)
	}
	if !strings.Contains(out, nvmBin) {
		t.Fatalf("expected surgical NVM node dir in PATH, got %q", out)
	}
}

func TestProbeAdapterAuthDiscardsSecretsAndHandlesStatus(t *testing.T) {
	const secret = "sk-ant-never-leak-this-token"
	root := t.TempDir()
	home := filepath.Join(root, "home")
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	claudePath := filepath.Join(binDir, "claude")
	if err := os.WriteFile(claudePath, []byte("#!/bin/sh\necho '{\"token\":\""+secret+"\"}'\necho 'err "+secret+"' >&2\nexit \"${CLAUDE_TEST_EXIT:-0}\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	claude, _ := AdapterFor(RuntimeClaude)
	env := []string{"HOME=" + home, "PATH=" + binDir + ":/usr/bin:/bin"}

	// Note: AgentEnv drops CLAUDE_TEST_EXIT, so verify via separate script exit code.
	status, diag := ProbeAdapterAuth(context.Background(), claude, env)
	if status != authprobe.Authorized || diag.ExitCode != 0 {
		t.Fatalf("authorized probe got status=%q diag=%+v", status, diag)
	}
	raw, err := json.Marshal(diag)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), secret) {
		t.Fatalf("diagnostic leaked secret: %s", raw)
	}

	// Overwrite script to exit 1 (unauthorized).
	if err := os.WriteFile(claudePath, []byte("#!/bin/sh\necho 'unauthorized "+secret+"'\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	status, diag = ProbeAdapterAuth(context.Background(), claude, env)
	if status != authprobe.Unauthorized || diag.ExitCode != 1 {
		t.Fatalf("unauthorized probe got status=%q diag=%+v", status, diag)
	}
	if raw, _ = json.Marshal(diag); strings.Contains(string(raw), secret) {
		t.Fatalf("unauthorized diagnostic leaked secret: %s", raw)
	}

	// Adapter with no auth command returns Unknown / no_auth_command.
	grok, _ := AdapterFor(RuntimeGrok)
	status, diag = ProbeAdapterAuth(context.Background(), grok, env)
	if status != authprobe.Unknown || diag.Code != "no_auth_command" {
		t.Fatalf("grok auth probe got status=%q diag=%+v", status, diag)
	}
}

func TestIsolatedHomeNonInteractiveProbeDoesNotHideHealthyRuntimes(t *testing.T) {
	const plantedSecret = "sk-ant-isolated-home-secret-9876"
	root := t.TempDir()
	isoHome := filepath.Join(root, "isolated-home")
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(isoHome, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HOME", isoHome)
	t.Setenv("PATH", binDir+":/usr/bin:/bin")
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	t.Setenv("ANTHROPIC_API_KEY", plantedSecret)

	// Stub resolveArtifact so native/script binary lookup doesn't depend on host binaries,
	// while exercising non-interactive probes across a failing runtime and a healthy runtime.
	oldResolve := resolveArtifact
	resolveArtifact = func(name string) (RuntimeArtifact, error) {
		if name == "codex" {
			return RuntimeArtifact{}, binaryutil.ErrBinaryIdentityUnknown
		}
		return RuntimeArtifact{
			Path:   filepath.Join(binDir, name),
			Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("c", 64)},
		}, nil
	}
	t.Cleanup(func() { resolveArtifact = oldResolve })

	// Create a failing claude script that prints a secret on stdout and exits non-zero.
	claudeBin := filepath.Join(binDir, "claude")
	if err := os.WriteFile(claudeBin, []byte("#!/bin/sh\necho 'error token="+plantedSecret+"'\nexit 2\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	// Probe both failing runtimes (claude exits 2, codex identity unknown) alongside healthy fake runtime.
	api, srv := newFakeAPI(t)
	d := New(Config{
		API:          srv.URL,
		Token:        testToken,
		Home:         filepath.Join(root, "daemon-home"),
		PollInterval: 20 * time.Millisecond,
		Runtimes:     []string{RuntimeClaude, RuntimeCodex, RuntimeFake},
		Version:      "1.0.0-test",
		Probe:        ExecRunner,
		LookPath:     func(string) (string, error) { return "/usr/bin/true", nil },
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
	})

	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()

	deadline := time.Now().Add(5 * time.Second)
	var req ClaimRequest
	for time.Now().Before(deadline) {
		api.mu.Lock()
		var last []byte
		if len(api.bodies) > 0 {
			last = api.bodies[len(api.bodies)-1]
		}
		api.mu.Unlock()
		if last != nil && json.Unmarshal(last, &req) == nil && req.RuntimeStatus != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	<-stopped

	// Healthy fake runtime MUST still be offered even though claude and codex probes failed.
	if !slices.Equal(req.Runtimes, []string{RuntimeFake}) {
		t.Fatalf("offered runtimes = %v, want [%s]", req.Runtimes, RuntimeFake)
	}
	if len(req.RuntimeStatus) != 3 {
		t.Fatalf("expected 3 runtime statuses, got %+v", req.RuntimeStatus)
	}
	for _, st := range req.RuntimeStatus {
		if strings.Contains(st.Reason, plantedSecret) || strings.Contains(st.Version, plantedSecret) {
			t.Fatalf("secret leaked in RuntimeStatus for %s: %+v", st.Runtime, st)
		}
	}
	// Fake runtime must be Ready=true while claude and codex are Ready=false.
	if req.RuntimeStatus[0].Ready || req.RuntimeStatus[1].Ready || !req.RuntimeStatus[2].Ready {
		t.Fatalf("unexpected readiness flags: %+v", req.RuntimeStatus)
	}

	// Verify SubscriptionFromStatuses also omits secrets and keeps status structure intact.
	sub := SubscriptionFromStatuses(req.RuntimeStatus, CurrentPlatform())
	if strings.Contains(ReportJSON(sub), plantedSecret) {
		t.Fatalf("subscription report leaked secret: %s", ReportJSON(sub))
	}

	// Verify AuthStateFromProbe mapping for Configured / Authorized / Unauthorized / Unknown.
	if state, _ := AuthStateFromProbe(authprobe.Configured, authprobe.AuthDiagnostic{}); state != authSignedIn {
		t.Fatalf("Configured mapped to %q, want %q", state, authSignedIn)
	}
	if state, _ := AuthStateFromProbe(authprobe.Authorized, authprobe.AuthDiagnostic{}); state != authSignedIn {
		t.Fatalf("Authorized mapped to %q, want %q", state, authSignedIn)
	}
	if state, _ := AuthStateFromProbe(authprobe.Unauthorized, authprobe.AuthDiagnostic{}); state != authSignedOut {
		t.Fatalf("Unauthorized mapped to %q, want %q", state, authSignedOut)
	}
	if state, note := AuthStateFromProbe(authprobe.Unknown, authprobe.AuthDiagnostic{Code: "no_auth_command"}); state != authUnknown || note != noteNoCommand {
		t.Fatalf("Unknown/no_auth_command mapped to (%q, %q)", state, note)
	}
}
