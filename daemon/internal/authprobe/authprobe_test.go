package authprobe

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeProbeScript(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestProbeCommandStatusesAndZeroSecretLeakage(t *testing.T) {
	const secretToken = "sk-ant-super-secret-value-12345"
	dir := t.TempDir()

	script := writeProbeScript(t, dir, "probe-cli", `
echo "stdout token=`+secretToken+`"
echo "stderr bearer `+secretToken+`" >&2
exit "${PROBE_EXIT:-0}"
`)

	classify := func(code int) (AuthStatus, string) {
		switch code {
		case 0:
			return Authorized, "signed_in"
		case 2:
			return Configured, "configured_only"
		default:
			return Unauthorized, "signed_out"
		}
	}

	cases := []struct {
		name       string
		exitEnv    string
		wantStatus AuthStatus
		wantCode   string
		wantExit   int
	}{
		{"authorized", "0", Authorized, "signed_in", 0},
		{"configured", "2", Configured, "configured_only", 2},
		{"unauthorized", "1", Unauthorized, "signed_out", 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := []string{
				"PATH=" + os.Getenv("PATH"),
				"PROBE_EXIT=" + tc.exitEnv,
				"SECRET_KEY=" + secretToken,
			}
			status, diag := ProbeCommand(context.Background(), script, []string{"auth", "status"}, env, classify)
			if status != tc.wantStatus {
				t.Fatalf("status = %q, want %q", status, tc.wantStatus)
			}
			if diag.Method != MethodCommand || diag.Code != tc.wantCode || diag.ExitCode != tc.wantExit {
				t.Fatalf("diag = %+v", diag)
			}
			raw, err := json.Marshal(diag)
			if err != nil {
				t.Fatal(err)
			}
			js := string(raw)
			if strings.Contains(js, secretToken) || strings.Contains(js, "stdout") || strings.Contains(js, "stderr") {
				t.Fatalf("diagnostic leaked output or secret: %s", js)
			}
		})
	}
}

func TestProbeCommandUnknownOnMissingAndTimeout(t *testing.T) {
	status, diag := ProbeCommand(context.Background(), "", nil, nil, nil)
	if status != Unknown || diag.Code != "missing_binary" || diag.ExitCode != -1 {
		t.Fatalf("empty binary: status=%q diag=%+v", status, diag)
	}

	status, diag = ProbeCommand(context.Background(), filepath.Join(t.TempDir(), "nonexistent"), nil, nil, nil)
	if status != Unknown || diag.Code != "not_found" || diag.ExitCode != -1 {
		t.Fatalf("missing binary: status=%q diag=%+v", status, diag)
	}

	dir := t.TempDir()
	slow := writeProbeScript(t, dir, "slow-cli", "sleep 5")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	status, diag = ProbeCommand(ctx, slow, nil, []string{"PATH=" + os.Getenv("PATH")}, nil)
	if status != Unknown || diag.Code != "timeout" || diag.ExitCode != -1 {
		t.Fatalf("timeout: status=%q diag=%+v", status, diag)
	}
}

func TestProbeCommandNilEnvDoesNotInheritDaemonSecrets(t *testing.T) {
	const ambientSecret = "sk-ambient-daemon-secret-xyz"
	t.Setenv("AMBIENT_LEAK_TEST", ambientSecret)

	dir := t.TempDir()
	outFile := filepath.Join(dir, "seen-env")
	script := writeProbeScript(t, dir, "env-check", `
printenv AMBIENT_LEAK_TEST > "`+outFile+`" 2>/dev/null || true
exit 0
`)

	status, diag := ProbeCommand(context.Background(), script, nil, nil, nil)
	if status != Authorized || diag.ExitCode != 0 {
		t.Fatalf("status=%q diag=%+v", status, diag)
	}
	data, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), ambientSecret) {
		t.Fatalf("nil env inherited parent process secret: %q", string(data))
	}
}
