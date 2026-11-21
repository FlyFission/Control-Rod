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
	t.Setenv("HTTPS_PROXY", "http://stale.invalid:1")

	home := t.TempDir()
	readyFile := filepath.Join(t.TempDir(), "proxy-ready")
	releaseFile := filepath.Join(t.TempDir(), "release")
	script := fmt.Sprintf(`set -eu
printf '%%s\n%%s\n' "$HTTP_PROXY" "$HTTPS_PROXY" > %q
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
			if len(lines) == 2 && lines[0] != "" && lines[0] == lines[1] {
				proxyURL = lines[0]
				break
			}
		}
		time.Sleep(15 * time.Millisecond)
	}
	if proxyURL == "" {
		_ = os.WriteFile(releaseFile, []byte("go"), 0o600)
		comp := <-done
		t.Fatalf("author run did not observe HTTP_PROXY/HTTPS_PROXY (status=%q err=%q)", comp.Status, comp.Error)
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
	if strings.Count(envText, "HTTP_PROXY=") != 1 || strings.Count(envText, "HTTPS_PROXY=") != 1 {
		t.Fatalf("expected single HTTP_PROXY and HTTPS_PROXY entries in child env:\n%s", envText)
	}
	if !strings.Contains(envText, "HTTP_PROXY="+proxyURL) || !strings.Contains(envText, "HTTPS_PROXY="+proxyURL) {
		t.Fatalf("child env missing %s:\n%s", proxyURL, envText)
	}
}

func TestWireAuthorEgressFilterPoliciesAndCheckerSkip(t *testing.T) {
	t.Run("disabled when env unset", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "")
		cmd := exec.Command("true")
		ef, err := wireAuthorEgressFilter(cmd, &Workspace{}, testPolicy())
		if err != nil || ef != nil {
			t.Fatalf("expected nil filter, got ef=%v err=%v", ef, err)
		}
		if v := envValue(cmd.Env, "HTTP_PROXY"); v != "" {
			t.Fatalf("HTTP_PROXY injected when CONTROLROD_EGRESS_FILTER is unset: %q", v)
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
		ef, err := wireAuthorEgressFilter(cmd, &Workspace{Checker: true}, testPolicy())
		if err != nil || ef != nil {
			t.Fatalf("expected nil filter for checker, got ef=%v err=%v", ef, err)
		}
		if called != 0 {
			t.Fatalf("startEgressFilter called %d times for checker", called)
		}
		if v := envValue(cmd.Env, "HTTP_PROXY"); v != "" {
			t.Fatalf("HTTP_PROXY injected on checker command: %q", v)
		}
		if v := envValue(cmd.Env, "HTTPS_PROXY"); v != "" {
			t.Fatalf("HTTPS_PROXY injected on checker command: %q", v)
		}
	})

	t.Run("sandbox empty AllowedHosts denies all outbound CONNECT", func(t *testing.T) {
		t.Setenv("CONTROLROD_EGRESS_FILTER", "1")
		cmd := exec.Command("true")
		p := testPolicy()
		p.AllowedHosts = []string{}
		ef, err := wireAuthorEgressFilter(cmd, &Workspace{}, p)
		if err != nil || ef == nil {
			t.Fatalf("wireAuthorEgressFilter: ef=%v err=%v", ef, err)
		}
		defer ef.Close()

		want := "http://" + ef.Addr()
		if got := envValue(cmd.Env, "HTTP_PROXY"); got != want {
			t.Fatalf("HTTP_PROXY=%q want %q", got, want)
		}
		if got := envValue(cmd.Env, "HTTPS_PROXY"); got != want {
			t.Fatalf("HTTPS_PROXY=%q want %q", got, want)
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

	t.Run("sandbox AllowedHosts normalizes default port 443 and preserves explicit ports", func(t *testing.T) {
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
		p.AllowedHosts = []string{"api.anthropic.com", "127.0.0.1:11434"}
		ef, err := wireAuthorEgressFilter(cmd, &Workspace{}, p)
		if err != nil || ef == nil {
			t.Fatalf("wireAuthorEgressFilter: ef=%v err=%v", ef, err)
		}
		defer ef.Close()

		want := []string{"api.anthropic.com:443", "127.0.0.1:11434"}
		if !slices.Equal(gotHosts, want) {
			t.Fatalf("hosts=%v want %v", gotHosts, want)
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
