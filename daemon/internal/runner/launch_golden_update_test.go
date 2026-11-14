//go:build launchgoldenupdate

package runner

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestUpdateLaunchAndStreamGoldens rewrites the committed fixtures. It does not compare
// them to the bytes it just wrote. Run with: go test -tags launchgoldenupdate -run TestUpdateLaunchAndStreamGoldens
func TestUpdateLaunchAndStreamGoldens(t *testing.T) {
	root, p := prepareGoldenRoot(t)
	withGoldenEnv(t, func() {
		for _, c := range launchCases {
			got := normalizeLaunch(root, captureLaunch(t, root, p, c))
			path := filepath.Join("testdata", "launch-golden", c.id+".json")
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, mustGoldenJSON(t, got), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	})
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		stream string
		id     string
	}{
		{"claude-stream.jsonl", RuntimeClaude},
		{"codex-stream.jsonl", RuntimeCodex},
	} {
		a, ok := AdapterFor(c.id)
		if !ok {
			t.Fatal(c.id)
		}
		got := streamCapture(t, a, filepath.Join("testdata", c.stream), now)
		path := filepath.Join("testdata", "stream-golden", c.id+".json")
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, mustJSON(t, got), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
