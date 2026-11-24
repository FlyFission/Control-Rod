//go:build unix

package runner

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func connectViaProxy(addr, target string) (*http.Response, error) {
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target); err != nil {
		return nil, err
	}
	return http.ReadResponse(bufio.NewReader(conn), nil)
}

func TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun(t *testing.T) {
	t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
	t.Setenv("HTTP_PROXY", "http://stale.invalid:1")
	t.Setenv("http_proxy", "http://stale-lower.invalid:1")
	t.Setenv("HTTPS_PROXY", "http://stale.invalid:1")
	t.Setenv("https_proxy", "http://stale-lower.invalid:1")
	t.Setenv("NO_PROXY", "*")
	t.Setenv("no_proxy", "127.0.0.1,localhost")

	home := t.TempDir()
	readyFile := filepath.Join(t.TempDir(), "proxy-ready")
	releaseFile := filepath.Join(t.TempDir(), "release")
	script := fmt.Sprintf(`set -eu
printf '%%s\n%%s\n%%s\n%%s\n' "$HTTP_PROXY" "$http_proxy" "$HTTPS_PROXY" "$https_proxy" > %q
env > out/env.txt
i=0
while [ ! -f %q ] && [ "$i" -lt 200 ]; do
  sleep 0.02
  i=$((i + 1))
done
echo '{"type":"result","subtype":"success"}'
`, readyFile, releaseFile)

	job := &Job{
		Run: testRun("run-egress-author", "author"),
		Inputs: []NamedFile{
			{Name: "BRIEF.md", ContentBase64: b64("Run with egress filter.")},
			{Name: "FAKE.sh", ContentBase64: b64(script)},
		},
	}
	d := New(Config{
		API:      "http://127.0.0.1:1",
		Token:    testToken,
		Home:     home,
		Timeout:  15 * time.Second,
		Runtimes: []string{RuntimeFake},
		Version:  "test",
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})

	done := make(chan Completion, 1)
	go func() {
		done <- d.Execute(context.Background(), job)
	}()

	var proxyURL string
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		b, err := os.ReadFile(readyFile)
		if err == nil {
			lines := strings.Split(strings.TrimSpace(string(b)), "\n")
			if len(lines) == 4 && lines[0] != "" &&
				lines[0] == lines[1] && lines[1] == lines[2] && lines[2] == lines[3] {
				proxyURL = lines[0]
				break
			}
		}
		time.Sleep(15 * time.Millisecond)
	}
	if proxyURL == "" {
		_ = os.WriteFile(releaseFile, []byte("go"), 0o600)
		comp := <-done
		t.Fatalf("author run did not observe HTTP_PROXY/http_proxy/HTTPS_PROXY/https_proxy (status=%q err=%q)", comp.Status, comp.Error)
	}
	if !strings.HasPrefix(proxyURL, "http://127.0.0.1:") {
		_ = os.WriteFile(releaseFile, []byte("go"), 0o600)
		<-done
		t.Fatalf("unexpected proxy URL %q", proxyURL)
	}

	proxyAddr := strings.TrimPrefix(proxyURL, "http://")
	resp, err := connectViaProxy(proxyAddr, "blocked.example.com:443")
	if err != nil {
		_ = os.WriteFile(releaseFile, []byte("go"), 0o600)
		<-done
		t.Fatalf("proxy unreachable while author run active: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden || resp.Header.Get("X-ControlRod-Egress") != "blocked" {
		_ = os.WriteFile(releaseFile, []byte("go"), 0o600)
		<-done
		t.Fatalf("expected 403 X-ControlRod-Egress=blocked from active proxy, got %d (%q)", resp.StatusCode, resp.Header.Get("X-ControlRod-Egress"))
	}

	if err := os.WriteFile(releaseFile, []byte("go"), 0o600); err != nil {
		t.Fatal(err)
	}
	comp := <-done
	if comp.Status != "succeeded" {
		t.Fatalf("author run failed: status=%q err=%q", comp.Status, comp.Error)
	}

	// Verify deferred ef.Close() tore down the proxy once Execute finished.
	if conn, err := net.DialTimeout("tcp", proxyAddr, 200*time.Millisecond); err == nil {
		_ = conn.Close()
		t.Fatalf("egress proxy %s remained open after author run finished", proxyAddr)
	}

	envText := mustRead(t, filepath.Join(home, "work", "WP-0007", "r2", "author-1-run-egress-author", "out", "env.txt"))
	for _, key := range []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"} {
		if strings.Count(envText, key+"=") != 1 || !strings.Contains(envText, key+"="+proxyURL) {
			t.Fatalf("expected single %s=%s in child env:\n%s", key, proxyURL, envText)
		}
	}
	for _, stripped := range []string{"NO_PROXY=", "no_proxy="} {
		if strings.Contains(envText, stripped) {
			t.Fatalf("child env still contains %s:\n%s", stripped, envText)
		}
	}
}

func TestWireAuthorEgressFilterPoliciesAndCheckerSkip(t *testing.T) {
	t.Run("enabled by default for real runtime when env unset", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "")
		cmd := exec.Command("true")
		ef, err := wireAuthorEgressFilter(RuntimeClaude, cmd, &Workspace{}, testPolicy())
		if err != nil || ef == nil {
			t.Fatalf("expected active filter by default, got ef=%v err=%v", ef, err)
		}
		defer ef.Close()
		if v := envValue(cmd.Env, "HTTP_PROXY"); v != "http://"+ef.Addr() {
			t.Fatalf("HTTP_PROXY=%q want %q", v, "http://"+ef.Addr())
		}
	})

	t.Run("disabled when CONTROLROD_EGRESS_FILTER=0", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "0")
		cmd := exec.Command("true")
		ef, err := wireAuthorEgressFilter(RuntimeClaude, cmd, &Workspace{}, testPolicy())
		if err != nil || ef != nil {
			t.Fatalf("expected nil filter, got ef=%v err=%v", ef, err)
		}
		if v := envValue(cmd.Env, "HTTP_PROXY"); v != "" {
			t.Fatalf("HTTP_PROXY injected when CONTROLROD_EGRESS_FILTER=0: %q", v)
		}
	})

	t.Run("checker workspace skips proxy even when enabled", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
		called := 0
		old := startEgressFilter
		startEgressFilter = func(hosts []string) (*EgressFilter, error) {
			called++
			return old(hosts)
		}
		t.Cleanup(func() { startEgressFilter = old })

		cmd := exec.Command("true")
		ef, err := wireAuthorEgressFilter(RuntimeClaude, cmd, &Workspace{Checker: true}, testPolicy())
		if err != nil || ef != nil {
			t.Fatalf("expected nil filter for checker, got ef=%v err=%v", ef, err)
		}
		if called != 0 {
			t.Fatalf("startEgressFilter called %d times for checker", called)
		}
		for _, k := range []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"} {
			if v := envValue(cmd.Env, k); v != "" {
				t.Fatalf("%s injected on checker command: %q", k, v)
			}
		}
	})

	t.Run("sandbox empty AllowedHosts with no provider hosts denies all outbound CONNECT", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
		cmd := exec.Command("true")
		cmd.Env = []string{"http_proxy=http://old:1", "ALL_PROXY=socks5://old:1", "all_proxy=socks5://old:1", "NO_PROXY=*", "no_proxy=localhost", "KEEP=1"}
		p := testPolicy()
		p.AllowedHosts = []string{}
		ef, err := wireAuthorEgressFilter("", cmd, &Workspace{}, p)
		if err != nil || ef == nil {
			t.Fatalf("wireAuthorEgressFilter: ef=%v err=%v", ef, err)
		}
		defer ef.Close()

		want := "http://" + ef.Addr()
		for _, k := range []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"} {
			if got := envValue(cmd.Env, k); got != want {
				t.Fatalf("%s=%q want %q", k, got, want)
			}
		}
		for _, k := range []string{"ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"} {
			if got := envValue(cmd.Env, k); got != "" {
				t.Fatalf("%s=%q was not stripped", k, got)
			}
		}
		if got := envValue(cmd.Env, "KEEP"); got != "1" {
			t.Fatalf("unrelated env KEEP=%q", got)
		}
		resp, err := connectViaProxy(ef.Addr(), "127.0.0.1:11434")
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("empty AllowedHosts should deny 127.0.0.1:11434, got %d", resp.StatusCode)
		}
	})

	t.Run("sandbox empty AllowedHosts still includes runtime provider host without mutating policy", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
		for _, tc := range []struct {
			runtime   string
			wantHosts []string
		}{
			{runtime: RuntimeClaude, wantHosts: []string{"api.anthropic.com:443"}},
			// Codex also carries its ChatGPT sign-in hosts (harnessSignInHosts).
			{runtime: RuntimeCodex, wantHosts: []string{"api.openai.com:443", "chatgpt.com:443", "auth.openai.com:443"}},
		} {
			t.Run(tc.runtime, func(t *testing.T) {
				var gotHosts []string
				old := startEgressFilter
				startEgressFilter = func(hosts []string) (*EgressFilter, error) {
					gotHosts = append([]string(nil), hosts...)
					return old(hosts)
				}
				t.Cleanup(func() { startEgressFilter = old })

				cmd := exec.Command("true")
				p := testPolicy()
				p.AllowedHosts = []string{}
				ef, err := wireAuthorEgressFilter(tc.runtime, cmd, &Workspace{}, p)
				if err != nil || ef == nil {
					t.Fatalf("wireAuthorEgressFilter: ef=%v err=%v", ef, err)
				}
				defer ef.Close()

				if !slices.Equal(gotHosts, tc.wantHosts) {
					t.Fatalf("hosts=%v want %v", gotHosts, tc.wantHosts)
				}
				if len(p.AllowedHosts) != 0 {
					t.Fatalf("sandbox.AllowedHosts was mutated: %v", p.AllowedHosts)
				}
				resp, err := connectViaProxy(ef.Addr(), "127.0.0.1:11434")
				if err != nil {
					t.Fatal(err)
				}
				_ = resp.Body.Close()
				if resp.StatusCode != http.StatusForbidden {
					t.Fatalf("non-provider host should be blocked, got %d", resp.StatusCode)
				}
			})
		}
	})

	t.Run("sandbox AllowedHosts combines with provider hosts, deduplicates, and preserves explicit ports", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
		var gotHosts []string
		old := startEgressFilter
		startEgressFilter = func(hosts []string) (*EgressFilter, error) {
			gotHosts = append([]string(nil), hosts...)
			return old(hosts)
		}
		t.Cleanup(func() { startEgressFilter = old })

		cmd := exec.Command("true")
		p := testPolicy()
		p.AllowedHosts = []string{"docs.example.org", "127.0.0.1:11434", "api.anthropic.com"}
		ef, err := wireAuthorEgressFilter(RuntimeClaude, cmd, &Workspace{}, p)
		if err != nil || ef == nil {
			t.Fatalf("wireAuthorEgressFilter: ef=%v err=%v", ef, err)
		}
		defer ef.Close()

		want := []string{"docs.example.org:443", "127.0.0.1:11434", "api.anthropic.com:443"}
		if !slices.Equal(gotHosts, want) {
			t.Fatalf("hosts=%v want %v", gotHosts, want)
		}
		if !slices.Equal(p.AllowedHosts, []string{"docs.example.org", "127.0.0.1:11434", "api.anthropic.com"}) {
			t.Fatalf("sandbox.AllowedHosts mutated: %v", p.AllowedHosts)
		}
	})
}

func TestCheckerExecuteNeverStartsAuthorEgressProxy(t *testing.T) {
	t.Setenv("CONTROLROD_EGRESS_FILTER", "1")

	binDir := t.TempDir()
	claudeBin := filepath.Join(binDir, "claude")
	rawBin := []byte("#!/bin/sh\nexit 0\n")
	if err := os.WriteFile(claudeBin, rawBin, 0o755); err != nil {
		t.Fatal(err)
	}
	sumBytes := sha256.Sum256(rawBin)
	sumHex := hex.EncodeToString(sumBytes[:])

	oldResolve := resolveArtifact
	resolveArtifact = func(binary string) (RuntimeArtifact, error) {
		if binary != "claude" {
			return RuntimeArtifact{}, fmt.Errorf("unexpected binary %q", binary)
		}
		return RuntimeArtifact{
			Path:   claudeBin,
			Digest: Digest{Algorithm: "sha256", Value: sumHex},
		}, nil
	}
	t.Cleanup(func() { resolveArtifact = oldResolve })

	egressCalls := 0
	oldStart := startEgressFilter
	startEgressFilter = func(hosts []string) (*EgressFilter, error) {
		egressCalls++
		return oldStart(hosts)
	}
	t.Cleanup(func() { startEgressFilter = oldStart })

	pj := policyJob(t, testPolicy())
	run := pj.Run
	run.ID = "run-chk-egress"
	run.Role = "pre-check"
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: RuntimeClaude, Model: "default"}
	job := &Job{
		Run:                 run,
		Inputs:              []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("Check deliverables.")}},
		SandboxPolicyRaw:    pj.SandboxPolicyRaw,
		SandboxPolicyDigest: pj.SandboxPolicyDigest,
	}

	probe := answers(map[string]ans{
		"claude --version":   {"2.1.0 (Claude Code)", 0},
		"claude auth status": {"", 0},
	})
	d := New(Config{
		API:                "http://127.0.0.1:1",
		Token:              testToken,
		Home:               t.TempDir(),
		Timeout:            10 * time.Second,
		Runtimes:           []string{RuntimeClaude},
		Version:            "test",
		Probe:              probe.run,
		LookPath:           found,
		ManagedCodexConfig: []string{},
		Logger:             slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	d.probe(context.Background())

	comp := d.Execute(context.Background(), job)
	if egressCalls != 0 {
		t.Fatalf("checker run started author egress proxy %d times", egressCalls)
	}
	// Sanity check that the run progressed past VerifyLaunch (into checker admission)
	// rather than aborting before the egress wiring point.
	if strings.Contains(comp.Error, "has not passed the sandbox preflight") ||
		strings.Contains(comp.Error, "not available") ||
		strings.Contains(comp.Error, "sandbox policy") {
		t.Fatalf("checker run aborted before reaching egress wiring point: %+v", comp)
	}
}

// A ChatGPT-signed-in Codex talks to chatgpt.com and refreshes at auth.openai.com. The
// default-on author egress filter must let both through, or Codex fails on its first run.
func TestAuthorEgressHostsAllowCodexChatGPTSignIn(t *testing.T) {
	for _, sandbox := range []*SandboxPolicy{nil, {AllowedHosts: []string{"github.com"}}} {
		hosts := authorEgressHosts("codex", sandbox)
		ef, err := StartEgressFilter(hosts)
		if err != nil {
			t.Fatalf("start egress filter: %v", err)
		}
		for _, h := range []string{"api.openai.com:443", "chatgpt.com:443", "auth.openai.com:443"} {
			if !ef.isAllowed(h) {
				t.Errorf("sandbox=%v: %s blocked; allowlist %v", sandbox != nil, h, hosts)
			}
		}
		if ef.isAllowed("example.com:443") {
			t.Errorf("sandbox=%v: example.com allowed; allowlist %v", sandbox != nil, hosts)
		}
		_ = ef.Close()
	}
	for _, h := range authorEgressHosts("claude", nil) {
		if strings.HasPrefix(h, "chatgpt.com") || strings.HasPrefix(h, "auth.openai.com") {
			t.Errorf("claude allowlist carries Codex sign-in host %s", h)
		}
	}
}
