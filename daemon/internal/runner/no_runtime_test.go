package runner

import (
	"strings"
	"testing"
)

func TestNoRuntimeMessageNamesEveryRuntimeThatCanStart(t *testing.T) {
	linux := NoRuntimeMessage("linux")
	if !strings.Contains(linux, "install Claude Code or Codex") || !strings.Contains(linux, "Grok CLI and Antigravity CLI run on macOS only") {
		t.Fatalf("on Linux: %q", linux)
	}
	mac := NoRuntimeMessage("darwin")
	for _, name := range []string{"Claude Code", "Codex", "Grok CLI", "Antigravity CLI"} {
		if !strings.Contains(mac, name) {
			t.Fatalf("on macOS the message names %s: %q", name, mac)
		}
	}
	for _, msg := range []string{linux, mac} {
		if strings.Contains(msg, "OpenCode") || strings.Contains(msg, "Ollama") || strings.Contains(msg, "fake") {
			t.Fatalf("a runtime that never starts is not offered: %q", msg)
		}
	}
	if !MacOSOnlyRuntime(RuntimeAgy) || !MacOSOnlyRuntime(RuntimeGrok) || MacOSOnlyRuntime(RuntimeClaude) {
		t.Fatal("Antigravity and Grok are the macOS-only runtimes")
	}
}
