package runner

import (
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
)

func writeCodexRollout(t *testing.T, home, name, body string) {
	t.Helper()
	dir := filepath.Join(home, "sessions", "2026", "11", "25")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCodexPostRunModelsReadsTurnContext(t *testing.T) {
	a := codexAdapter{}
	home := t.TempDir()
	if got := a.PostRunModels(home); len(got) != 0 {
		t.Fatalf("no sessions dir gave %v", got)
	}
	writeCodexRollout(t, home, "rollout-a.jsonl", strings.Join([]string{
		`{"type":"session_meta","payload":{"model":"not-this"}}`,
		`junk {{{ "turn_context"`,
		`{"type":"turn_context","payload":{"model":"gpt-6.2-sol"}}`,
		`{"type":"event_msg","payload":{"type":"turn_context","model":"nor-this"}}`,
		`{"type":"turn_context","payload":{"model":"gpt 6.2;rm -rf"}}`,
		`{"type":"turn_context","payload":{}}`,
	}, "\n"))
	got := a.PostRunModels(home)
	if !slices.Equal(got, []string{"gpt-6.2-sol", "gpt6.2rm-rf"}) {
		t.Fatalf("models = %v", got)
	}
}

func TestCodexPostRunModelsNoneFound(t *testing.T) {
	home := t.TempDir()
	writeCodexRollout(t, home, "rollout-a.jsonl", `{"type":"session_meta","payload":{"id":"x"}}`+"\n"+"not json\n")
	if got := (codexAdapter{}).PostRunModels(home); len(got) != 0 {
		t.Fatalf("models = %v", got)
	}
	if got := (codexAdapter{}).PostRunModels(""); got != nil {
		t.Fatalf("empty home gave %v", got)
	}
}

func TestCodexPostRunModelsTwoModelsAcrossRollouts(t *testing.T) {
	home := t.TempDir()
	writeCodexRollout(t, home, "rollout-a.jsonl", `{"type":"turn_context","payload":{"model":"gpt-6.2-sol"}}`+"\n")
	writeCodexRollout(t, home, "rollout-b.jsonl", `{"type":"turn_context","payload":{"model":"gpt-other"}}`+"\n"+`{"type":"turn_context","payload":{"model":"gpt-6.2-sol"}}`)
	got := (codexAdapter{}).PostRunModels(home)
	if !slices.Equal(got, []string{"gpt-6.2-sol", "gpt-other"}) {
		t.Fatalf("models = %v", got)
	}
}

func TestAddPostRunModelsFeedsTheObservedSet(t *testing.T) {
	home := t.TempDir()
	writeCodexRollout(t, home, "rollout-a.jsonl", `{"type":"turn_context","payload":{"model":"gpt-6.2-sol"}}`+"\n")
	buf := &logBuffer{adapt: codexAdapter{}}
	buf.addPostRunModels(codexAdapter{}, &Workspace{})
	if len(buf.observedModels()) != 0 {
		t.Fatal("a run with no isolated home read a rollout")
	}
	buf.addPostRunModels(codexAdapter{}, &Workspace{IsolatedLoginHome: home})
	if !slices.Equal(buf.observedModels(), []string{"gpt-6.2-sol"}) {
		t.Fatalf("observed = %v", buf.observedModels())
	}
}

func TestCodexEphemeralOnlyWithoutAnIsolatedHome(t *testing.T) {
	home, work := t.TempDir(), t.TempDir()
	at := SandboxPaths{Home: home, DaemonHome: filepath.Join(home, ".controlrod"), Workspace: work}
	iso := filepath.Join(t.TempDir(), "iso")
	plain := &Workspace{Dir: work, Scratch: filepath.Join(work, "scratch"), Checker: true}
	args, err := CodexArgs(plain, "", testPolicy(), at)
	if err != nil || !slices.Contains(args, "--ephemeral") {
		t.Fatalf("checker without an isolated home: %v %v", args, err)
	}
	withHome := &Workspace{Dir: work, Scratch: filepath.Join(work, "scratch"), Checker: true, IsolatedLoginHome: iso}
	args, err = CodexArgs(withHome, "", testPolicy(), at)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(args, "--ephemeral") {
		t.Fatal("checker with an isolated home kept --ephemeral")
	}
	if !strings.Contains(strings.Join(args, "\n"), strconv.Quote(iso)+`="deny"`) {
		t.Fatal("the isolated home is not denied to the agent's commands")
	}
	author := &Workspace{Dir: work, IsolatedLoginHome: iso}
	args, err = CodexArgs(author, "", testPolicy(), at)
	if err != nil || !slices.Contains(args, "--ephemeral") {
		t.Fatalf("author run lost --ephemeral: %v %v", args, err)
	}
}

func TestEphemeralOrIsolatedAdmission(t *testing.T) {
	real := filepath.Join(os.Getenv("HOME"), ".codex")
	if u, err := os.UserHomeDir(); err == nil {
		real = filepath.Join(u, ".codex")
	}
	withEph := []string{"exec", "--ephemeral"}
	without := []string{"exec"}
	if err := ephemeralOrIsolated(RuntimeCodex, withEph, nil); err != nil {
		t.Fatalf("--ephemeral refused: %v", err)
	}
	if err := ephemeralOrIsolated(RuntimeCodex, without, nil); err == nil {
		t.Fatal("no --ephemeral and no isolated home was accepted")
	}
	if err := ephemeralOrIsolated(RuntimeCodex, without, []string{"CODEX_HOME=" + filepath.Join(real, "x")}); err == nil && os.Getenv("CODEX_HOME") == "" {
		t.Fatal("a home inside the real login folder was accepted")
	}
	if err := ephemeralOrIsolated(RuntimeCodex, without, []string{"CODEX_HOME=" + t.TempDir()}); err != nil {
		t.Fatalf("a disposable home was refused: %v", err)
	}
	if err := ephemeralOrIsolated(RuntimeClaude, without, nil); err != nil {
		t.Fatalf("claude: %v", err)
	}
}

func credFixture(t *testing.T, orig string) (*Workspace, string, string) {
	t.Helper()
	dir := t.TempDir()
	host := filepath.Join(dir, "host-auth.json")
	cp := filepath.Join(dir, "copy-auth.json")
	if err := os.WriteFile(host, []byte(orig), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cp, []byte(orig), 0o600); err != nil {
		t.Fatal(err)
	}
	return &Workspace{CredentialCopy: &credentialCopy{Host: host, Copy: cp, Original: []byte(orig)}}, host, cp
}

func TestSaveRefreshedCredential(t *testing.T) {
	read := func(p string) string { b, _ := os.ReadFile(p); return string(b) }
	t.Run("host unchanged: written back", func(t *testing.T) {
		ws, host, cp := credFixture(t, `{"t":1}`)
		os.WriteFile(cp, []byte(`{"t":2}`), 0o600)
		if err := ws.SaveRefreshedCredential(); err != nil {
			t.Fatal(err)
		}
		if read(host) != `{"t":2}` {
			t.Fatalf("host = %s", read(host))
		}
		if st, _ := os.Stat(host); st.Mode().Perm() != 0o640 {
			t.Fatalf("mode = %v", st.Mode().Perm())
		}
		if ents, _ := os.ReadDir(filepath.Dir(host)); len(ents) != 2 {
			t.Fatalf("temp file left behind: %v", ents)
		}
	})
	t.Run("host changed meanwhile: untouched", func(t *testing.T) {
		ws, host, cp := credFixture(t, `{"t":1}`)
		os.WriteFile(cp, []byte(`{"t":2}`), 0o600)
		os.WriteFile(host, []byte(`{"t":3}`), 0o600)
		if err := ws.SaveRefreshedCredential(); err != nil || read(host) != `{"t":3}` {
			t.Fatalf("host = %s, %v", read(host), err)
		}
	})
	t.Run("copy unchanged: untouched", func(t *testing.T) {
		ws, host, _ := credFixture(t, `{"t":1}`)
		if err := ws.SaveRefreshedCredential(); err != nil || read(host) != `{"t":1}` {
			t.Fatal("changed")
		}
	})
	t.Run("copy not JSON: untouched", func(t *testing.T) {
		ws, host, cp := credFixture(t, `{"t":1}`)
		os.WriteFile(cp, []byte(`not json`), 0o600)
		if err := ws.SaveRefreshedCredential(); err != nil || read(host) != `{"t":1}` {
			t.Fatal("changed")
		}
	})
	t.Run("no copy recorded", func(t *testing.T) {
		if err := (&Workspace{}).SaveRefreshedCredential(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestRemoveStaleIsolatedHomes(t *testing.T) {
	parent := t.TempDir()
	keep := filepath.Join(parent, "run-new.codexhome")
	stale := filepath.Join(parent, "run-old.codexhome")
	other := filepath.Join(parent, "run-old.home")
	target := filepath.Join(parent, "target")
	link := filepath.Join(parent, "run-link.codexhome")
	file := filepath.Join(parent, "run-file.codexhome")
	for _, d := range []string{keep, stale, other, target} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	os.Symlink(target, link)
	os.WriteFile(file, nil, 0o600)
	os.WriteFile(filepath.Join(stale, "auth.json"), []byte("x"), 0o600)
	removeStaleIsolatedHomes(keep)
	for p, want := range map[string]bool{keep: true, stale: false, other: true, target: true, file: true} {
		if _, err := os.Lstat(p); (err == nil) != want {
			t.Errorf("%s exists=%v want %v", filepath.Base(p), err == nil, want)
		}
	}
	if _, err := os.Lstat(link); err != nil {
		t.Error("symlink was removed")
	}
	if _, err := os.Lstat(filepath.Join(target)); err != nil {
		t.Error("symlink target removed")
	}
}
