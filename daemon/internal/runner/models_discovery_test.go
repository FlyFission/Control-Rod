package runner

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestDiscoverCodexModelsReadsCacheAndDropsUnsafeEntries(t *testing.T) {
	dir := t.TempDir()
	cache := `{"models":[{"slug":"gpt-6.2-sol"},{"slug":"gpt-6.2-astra"},{"slug":"sk-secret-token"},{"slug":"bad slug"},{"slug":"gpt-6.2-sol"}]}`
	if err := os.WriteFile(filepath.Join(dir, "models_cache.json"), []byte(cache), 0o600); err != nil {
		t.Fatal(err)
	}
	got := discoverCodexModels("", func(k string) string {
		if k == "CODEX_HOME" {
			return dir
		}
		return ""
	})
	want := []string{"default", "gpt-6.2-sol", "gpt-6.2-astra"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestClaudeProbeReportsDefaultAndAliases(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "claude")
	if err := os.WriteFile(bin, []byte("\x7fELF-fake-claude-binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	st := Probe(context.Background(), RuntimeClaude, "", answers(map[string]ans{
		"claude --version": {"2.1.330 (Claude Code)\n", 0},
	}).run)
	if !st.Ready {
		t.Fatalf("expected ready, got %+v", st)
	}
	want := []string{"default", "sonnet", "opus", "haiku"}
	if !slices.Equal(st.Models, want) {
		t.Fatalf("got models %v, want %v", st.Models, want)
	}
}
