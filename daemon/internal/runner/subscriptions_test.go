//go:build unix

package runner

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestListsSubscriptionSkipsFakeAndAPIKeyCLIs(t *testing.T) {
	if !listsSubscription(claudeAdapter{}) || !listsSubscription(codexAdapter{}) {
		t.Fatal("claude and codex are subscription CLIs")
	}
	if listsSubscription(fakeAdapter{}) {
		t.Fatal("fake is not a provider CLI")
	}
	if listsSubscription(keyOnly{}) {
		t.Fatal("an API-key-only CLI is excluded")
	}
}

type keyOnly struct{ claudeAdapter }

func (keyOnly) ID() string       { return "keyed" }
func (keyOnly) APIKeyOnly() bool { return true }

func TestHostPlatform(t *testing.T) {
	cases := []struct{ goos, release, want string }{
		{"linux", "6.6.87.2-microsoft-standard-WSL2", "wsl2"},
		{"linux", "6.8.0-generic", "linux"},
		{"darwin", "", "darwin"},
		{"windows", "", "windows"},
		{"", "", "unknown"},
	}
	for _, c := range cases {
		if got := HostPlatform(c.goos, c.release); got != c.want {
			t.Errorf("HostPlatform(%q, %q) = %q, want %q", c.goos, c.release, got, c.want)
		}
	}
}

func TestQualificationMatrix(t *testing.T) {
	yes, _ := qualify(RuntimeClaude, "author", "wsl2", false)
	if !yes {
		t.Fatal("WSL2 Claude author")
	}
	yes, _ = qualify(RuntimeCodex, "author", "wsl2", false)
	if !yes {
		t.Fatal("WSL2 Codex author")
	}
	if ok, _ := qualify(RuntimeClaude, "checker", "wsl2", false); ok {
		t.Fatal("WSL2 checker is not qualified")
	}
	if ok, reason := qualify(RuntimeClaude, "author", "linux", false); ok || !strings.Contains(reason, "Native Linux") {
		t.Fatalf("native linux: %v %s", ok, reason)
	}
	if ok, reason := qualify(RuntimeClaude, "author", "darwin", false); ok || !strings.Contains(reason, "CONTROLROD_SEATBELT_QUALIFIED") {
		t.Fatalf("macos unset: %v %s", ok, reason)
	}
	if ok, _ := qualify(RuntimeClaude, "author", "darwin", true); !ok {
		t.Fatal("macos author with the seatbelt record")
	}
	if ok, _ := qualify(RuntimeCodex, "checker", "darwin", true); ok {
		t.Fatal("macos checker stays unqualified")
	}
	if ok, _ := qualify("other", "author", "wsl2", false); ok {
		t.Fatal("an unknown CLI is not qualified")
	}
	if seatbeltQualified(func(string) string { return "true" }) {
		t.Fatal("only the value 1 counts")
	}
	if !seatbeltQualified(func(k string) string {
		if k == "CONTROLROD_SEATBELT_QUALIFIED" {
			return "1"
		}
		return ""
	}) {
		t.Fatal("value 1 counts")
	}
}

func TestSubscriptionFromStatusesUsesProbeResults(t *testing.T) {
	art := &RuntimeArtifact{Path: "/opt/runtime", Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("a", 64)}}
	r := SubscriptionFromStatuses([]RuntimeStatus{
		{Runtime: RuntimeClaude, Ready: true, Version: "2.1.318 (Claude Code)", Artifact: art},
		{Runtime: RuntimeCodex, Ready: false, Version: "codex-cli 0.166.0", LoginChecked: true, Reason: "codex is installed but not signed in", Artifact: art},
		{Runtime: RuntimeFake, Ready: true, Version: "fake"},
	}, "wsl2", func(string) string { return "" })
	if len(r.Probes) != 2 || r.Probes[0].ID != RuntimeClaude || r.Probes[1].ID != RuntimeCodex {
		t.Fatalf("probes %+v", r.Probes)
	}
	claude := r.Probes[0]
	if !claude.Installed || claude.Path != "/opt/runtime" || claude.ObservedVersion != "2.1.318 (Claude Code)" {
		t.Fatalf("claude detection %+v", claude)
	}
	if claude.VendorFamily != "Anthropic" || claude.Auth != authSignedIn || claude.AuthNote != noteSignedIn {
		t.Fatalf("claude auth %+v", claude)
	}
	if !claude.Roles[0].Qualified || claude.Roles[0].Role != "author" || claude.Roles[1].Qualified {
		t.Fatalf("claude roles %+v", claude.Roles)
	}
	codex := r.Probes[1]
	if codex.VendorFamily != "OpenAI" || codex.Auth != authSignedOut || !codex.Installed {
		t.Fatalf("codex %+v", codex)
	}
	if strings.Contains(ReportJSON(r), "not signed in") {
		t.Fatal("the probe sentence was copied into the report")
	}
	if len(r.Checkers) != 2 {
		t.Fatalf("checkers %+v", r.Checkers)
	}
	ids := map[string]bool{}
	for _, c := range r.Checkers {
		ids[c.ID] = true
		if c.Local {
			t.Fatalf("registry checker %s is local", c.ID)
		}
		if c.ID == "claude-sonnet-4-5" && (c.VendorFamily != "Anthropic" || c.Harness != "claude" || !c.Deciding) {
			t.Fatalf("claude checker %+v", c)
		}
		if c.ID == "gpt-5-codex" && (c.VendorFamily != "OpenAI" || c.Harness != "codex") {
			t.Fatalf("codex checker %+v", c)
		}
	}
	if ids["ollama"] || ids["local-ollama"] {
		t.Fatal("a model that is not in the registry was listed")
	}
	if r.LocalRule != localCheckerRule {
		t.Fatal(r.LocalRule)
	}
	tainted := SubscriptionFromStatuses([]RuntimeStatus{{
		Runtime: RuntimeClaude, Ready: true, Version: "sk-ant-secret-token", Artifact: &RuntimeArtifact{Path: "/opt/sk-ant-secret-token"},
	}}, "linux", nil)
	raw := ReportJSON(tainted)
	if strings.Contains(raw, "sk-ant") || tainted.Probes[0].ObservedVersion != "" || tainted.Probes[0].Path != "" {
		t.Fatalf("credential text kept: %s", raw)
	}
}

func TestAuthOfDiscardsStatusOutput(t *testing.T) {
	const planted = "sk-ant-secret-token"
	s := &scripted{answers: map[string]ans{
		"claude auth status": {`{"loggedIn":true,"token":"` + planted + `"}`, 0},
		"codex login --help": {"Manage login\n\nCommands:\n  login  Sign in\n", 0},
	}}
	state, note := authOf(context.Background(), claudeAdapter{}, s.run)
	if state != authSignedIn || note != noteSignedIn || strings.Contains(note, planted) {
		t.Fatalf("claude %s %s", state, note)
	}
	state, note = authOf(context.Background(), codexAdapter{}, s.run)
	if state != authUnknown || note != noteNoCommand {
		t.Fatalf("codex %s %s", state, note)
	}
	for _, call := range s.calls {
		if call == "codex login status" {
			t.Fatal("status was run even though help does not list it")
		}
	}
	run := func(ctx context.Context, name string, args ...string) (string, int, error) {
		if name == "claude" {
			return planted, -1, errors.New("not run")
		}
		return s.run(ctx, name, args...)
	}
	state, note = authOf(context.Background(), claudeAdapter{}, run)
	if state != authUnknown || note != noteNotRun || strings.Contains(note, planted) {
		t.Fatalf("start failure %s %s", state, note)
	}
}

func TestMissingCLIIsReportedWithoutAStatus(t *testing.T) {
	r := SubscriptionFromStatuses([]RuntimeStatus{
		{Runtime: RuntimeClaude, Ready: true, Version: "2.1.0 (Claude Code)", Artifact: &RuntimeArtifact{Path: "/opt/claude"}},
	}, "darwin", func(string) string { return "1" })
	codex := r.Probes[1]
	if codex.Installed || codex.Auth != authUnknown || codex.AuthNote != noteNotInstalled || codex.Path != "" {
		t.Fatalf("missing codex %+v", codex)
	}
	if !r.Probes[0].Roles[0].Qualified || r.Probes[0].Roles[1].Qualified {
		t.Fatalf("darwin with the seatbelt record: %+v", r.Probes[0].Roles)
	}
	plain := SubscriptionFromStatuses([]RuntimeStatus{
		{Runtime: RuntimeClaude, Ready: false, Version: "2.1.0 (Claude Code)", Reason: "the agent sandbox is qualified only on WSL2 so far", Artifact: &RuntimeArtifact{Path: "/opt/claude"}},
	}, "linux", nil)
	if plain.Probes[0].Auth != authUnknown || plain.Probes[0].Roles[0].Qualified {
		t.Fatalf("native linux %+v", plain.Probes[0])
	}
}

func TestPublicTextDropsCredentialLines(t *testing.T) {
	if publicText("2.1.318 (Claude Code)") != "2.1.318 (Claude Code)" {
		t.Fatal("version")
	}
	if publicText("codex-cli 0.166.0") != "codex-cli 0.166.0" {
		t.Fatal("codex version")
	}
	for _, line := range []string{"sk-abc", "Bearer secret", "token=abc", "ghp_abc", "xoxb-1"} {
		if publicText(line) != "" {
			t.Fatalf("kept %q", line)
		}
	}
}
