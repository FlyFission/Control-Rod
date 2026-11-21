// Adapted from GoogleCloudPlatform/scion pkg/util/git_host_test.go (commit 8845a940763f91519d25e72cde3762d6e31df4cb, Apache-2.0).
// The config-listing, filter-pin and after-run tests follow upstream's; the filter-driver
// execution tests are local (change record .nuclear/changes/host-git-filter-pins/).

package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestHostGitArgsNeutralizesHostExecution(t *testing.T) {
	args := HostGitArgs()
	requiredPairs := [][2]string{
		{"core.hooksPath=" + os.DevNull, "-c"},
		{"core.fsmonitor=false", "-c"},
		{"core.pager=cat", "-c"},
		{"protocol.ext.allow=never", "-c"},
		{"protocol.file.allow=user", "-c"},
		{"submodule.recurse=false", "-c"},
		{"fetch.recurseSubmodules=false", "-c"},
		{"merge.verifySignatures=false", "-c"},
		{"commit.gpgsign=false", "-c"},
		{"tag.gpgsign=false", "-c"},
	}
	for _, pair := range requiredPairs {
		idx := slices.Index(args, pair[0])
		if idx <= 0 || args[idx-1] != pair[1] {
			t.Fatalf("expected %s %s in HostGitArgs(), got %v", pair[1], pair[0], args)
		}
	}
}

func TestHostGitNetworkArgsRestrictsProtocols(t *testing.T) {
	args := HostGitNetworkArgs()
	if !slices.Contains(args, "protocol.allow=never") {
		t.Fatalf("expected protocol.allow=never in HostGitNetworkArgs(), got %v", args)
	}
	if !slices.Contains(args, "protocol.https.allow=always") {
		t.Fatalf("expected protocol.https.allow=always in HostGitNetworkArgs(), got %v", args)
	}
}

func TestHostGitEnvStripsDangerousGitVars(t *testing.T) {
	in := []string{
		"PATH=/usr/bin:/bin",
		"GIT_DIR=/tmp/evil/.git",
		"GIT_WORK_TREE=/tmp/evil",
		"GIT_INDEX_FILE=/tmp/evil/index",
		"GIT_CONFIG_PARAMETERS='core.fsmonitor=evil'",
		"GIT_EXEC_PATH=/tmp/evil-bin",
		"GIT_TERMINAL_PROMPT=0",
		"GIT_SSH_COMMAND=ssh -o BatchMode=yes",
	}
	out := HostGitEnv(in)
	joined := strings.Join(out, "\n")
	for _, forbidden := range []string{"GIT_DIR=", "GIT_WORK_TREE=", "GIT_INDEX_FILE=", "GIT_CONFIG_PARAMETERS=", "GIT_EXEC_PATH="} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("HostGitEnv leaked %s: %v", forbidden, out)
		}
	}
	for _, kept := range []string{"PATH=/usr/bin:/bin", "GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes"} {
		if !slices.Contains(out, kept) {
			t.Fatalf("HostGitEnv dropped %s: %v", kept, out)
		}
	}
}

func TestHostGitCommandSetsArgsAndEnv(t *testing.T) {
	hostGitTestEnv(t)
	t.Setenv("GIT_DIR", "/tmp/should-be-stripped")
	t.Setenv("GIT_TERMINAL_PROMPT", "0")
	dir := t.TempDir()
	cmd, err := HostGitCommand(context.Background(), dir, "status", "--short")
	if err != nil {
		t.Fatalf("HostGitCommand: %v", err)
	}
	if cmd.Dir != dir {
		t.Fatalf("expected Dir=%s, got %q", dir, cmd.Dir)
	}
	if !slices.Contains(cmd.Args, "core.hooksPath="+os.DevNull) {
		t.Fatalf("expected core.hooksPath=%s in cmd.Args: %v", os.DevNull, cmd.Args)
	}
	if cmd.Args[len(cmd.Args)-2] != "status" || cmd.Args[len(cmd.Args)-1] != "--short" {
		t.Fatalf("expected trailing args [status --short], got %v", cmd.Args)
	}
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "GIT_DIR=") {
			t.Fatalf("expected GIT_DIR to be stripped from cmd.Env")
		}
	}
}

// hostGitTestEnv isolates git from the host's global and system config.
func hostGitTestEnv(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	global := filepath.Join(t.TempDir(), "gitconfig")
	if err := os.WriteFile(global, []byte("[user]\n\temail = you@example.com\n\tname = Your Name\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", global)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	return global
}

func hostRunGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v in %s: %v\n%s", args, dir, err, out)
	}
	return strings.TrimSpace(string(out))
}

// newFilterRepo returns a repository whose .gitattributes sends *.txt
// through the filter driver "evil", with one committed file, and a marker
// directory outside it. The driver is not defined yet.
func newFilterRepo(t *testing.T) (repo, markers string) {
	t.Helper()
	hostGitTestEnv(t)
	repo = filepath.Join(t.TempDir(), "repo")
	hostRunGit(t, filepath.Dir(repo), "init", "-q", "-b", "main", repo)
	for name, body := range map[string]string{".gitattributes": "*.txt filter=evil\n", "file.txt": "content\n"} {
		if err := os.WriteFile(filepath.Join(repo, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	hostRunGit(t, repo, "add", ".gitattributes", "file.txt")
	hostRunGit(t, repo, "commit", "-q", "-m", "initial")
	return repo, t.TempDir()
}

// evilDriver returns config lines defining filter driver "evil" in the
// form git config takes, each command touching a marker named for it.
func evilDriver(markers string) [][2]string {
	touch := func(name string) string {
		return "sh -c 'touch " + filepath.Join(markers, name) + "; cat'"
	}
	return [][2]string{
		{"filter.evil.clean", touch("clean")},
		{"filter.evil.smudge", touch("smudge")},
		{"filter.evil.process", "sh -c 'touch " + filepath.Join(markers, "process") + "; exit 1'"},
		{"filter.evil.required", "true"},
	}
}

func assertNoMarkers(t *testing.T, markers string) {
	t.Helper()
	entries, err := os.ReadDir(markers)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		t.Errorf("repository-defined filter command ran: %s", e.Name())
	}
}

// runHostGit runs a HostGitCommand and fails the test on any error.
func runHostGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd, err := HostGitCommand(context.Background(), dir, args...)
	if err != nil {
		t.Fatalf("HostGitCommand %v: %v", args, err)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("host git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

// exerciseFilters runs host-side commands that reach every filter
// variable: a checkout (smudge or process), and a modified file through
// status and add (clean or process).
func exerciseFilters(t *testing.T, repo string) {
	t.Helper()
	if err := os.Remove(filepath.Join(repo, "file.txt")); err != nil {
		t.Fatal(err)
	}
	runHostGit(t, repo, "checkout", "--", "file.txt")
	if err := os.WriteFile(filepath.Join(repo, "file.txt"), []byte("changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runHostGit(t, repo, "status", "--porcelain")
	runHostGit(t, repo, "add", "file.txt")
}

// HG-01: a filter driver defined in the repository's own config does not
// run through HostGitCommand, and required=true does not make the command
// fail once the driver is emptied.
func TestHostGitCommandNeutralizesRepoFilterDriver(t *testing.T) {
	repo, markers := newFilterRepo(t)
	for _, kv := range evilDriver(markers) {
		hostRunGit(t, repo, "config", kv[0], kv[1])
	}
	exerciseFilters(t, repo)
	assertNoMarkers(t, markers)
}

// HG-01: the same driver reached through include.path carries the scope of
// the including repository file and is pinned too.
func TestHostGitCommandNeutralizesIncludedFilterDriver(t *testing.T) {
	repo, markers := newFilterRepo(t)
	inc := filepath.Join(t.TempDir(), "included")
	for _, kv := range evilDriver(markers) {
		cmd := exec.Command("git", "config", "-f", inc, kv[0], kv[1])
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("write include: %v\n%s", err, out)
		}
	}
	hostRunGit(t, repo, "config", "include.path", inc)
	exerciseFilters(t, repo)
	assertNoMarkers(t, markers)
}

// HG-01: a per-worktree config (config.worktree) is repository scope too.
func TestHostGitCommandNeutralizesWorktreeFilterDriver(t *testing.T) {
	repo, markers := newFilterRepo(t)
	hostRunGit(t, repo, "config", "extensions.worktreeConfig", "true")
	for _, kv := range evilDriver(markers) {
		hostRunGit(t, repo, "config", "--worktree", kv[0], kv[1])
	}
	exerciseFilters(t, repo)
	assertNoMarkers(t, markers)
}

// HG-02: the host user's own (global) definition of a driver the
// repository also defines is the one that runs.
func TestHostGitCommandKeepsGlobalFilterDefinition(t *testing.T) {
	repo, markers := newFilterRepo(t)
	global := os.Getenv("GIT_CONFIG_GLOBAL")
	trusted := "sh -c 'touch " + filepath.Join(markers, "trusted") + "; cat'"
	cmd := exec.Command("git", "config", "-f", global, "filter.evil.smudge", trusted)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("write global: %v\n%s", err, out)
	}
	hostRunGit(t, repo, "config", "filter.evil.smudge", "sh -c 'touch "+filepath.Join(markers, "smudge")+"; cat'")

	hc, err := HostGitCommand(context.Background(), repo, "status")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(hc.Env, "GIT_CONFIG_VALUE_0="+trusted) {
		t.Fatalf("expected the global smudge pinned: %q", hc.Env)
	}
	if err := os.Remove(filepath.Join(repo, "file.txt")); err != nil {
		t.Fatal(err)
	}
	runHostGit(t, repo, "checkout", "--", "file.txt")
	if _, err := os.Stat(filepath.Join(markers, "smudge")); err == nil {
		t.Fatal("the repository's smudge ran")
	}
	if _, err := os.Stat(filepath.Join(markers, "trusted")); err != nil {
		t.Fatalf("the global smudge did not run: %v", err)
	}
}

// HG-03: a change to the repository's filter drivers while the command
// runs fails it; other changes do not.
func TestHostGitCmdDetectsFilterConfigChange(t *testing.T) {
	ctx := context.Background()
	repo, _ := newFilterRepo(t)

	cmd, err := HostGitCommand(ctx, repo, "config", "filter.late.smudge", "x")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := cmd.CombinedOutput(); !errors.Is(err, ErrRepoConfigChanged) {
		t.Errorf("filter driver added during the command: error = %v, want ErrRepoConfigChanged", err)
	}

	cmd, err = HostGitCommand(ctx, repo, "config", "filter.late.smudge", "y")
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); !errors.Is(err, ErrRepoConfigChanged) {
		t.Errorf("filter driver changed during the command: error = %v, want ErrRepoConfigChanged", err)
	}

	cmd, err = HostGitCommand(ctx, repo, "config", "user.name", "changed")
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Errorf("non-filter change: error = %v, want nil", err)
	}

	cmd, err = HostGitCommand(ctx, repo, "status", "--porcelain")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := cmd.Output(); err != nil {
		t.Errorf("unchanged: error = %v", err)
	}
}

// HG-04: an empty directory is refused, not run in the daemon's own
// working directory.
func TestHostGitCommandRequiresDir(t *testing.T) {
	if _, err := HostGitCommand(context.Background(), "", "status"); err == nil {
		t.Fatal("HostGitCommand with an empty dir: want an error")
	}
}

func TestParseGitConfigList(t *testing.T) {
	out := []byte("global\x00user.name\nA B\x00local\x00filter.My.Driver.smudge\nx\ny\x00local\x00core.flag\x00")
	got := parseGitConfigList(out)
	want := []gitConfigEntry{
		{scope: "global", key: "user.name", value: "A B", hasValue: true},
		{scope: "local", key: "filter.My.Driver.smudge", value: "x\ny", hasValue: true},
		{scope: "local", key: "core.flag", value: "", hasValue: false},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseGitConfigList = %#v, want %#v", got, want)
	}
	sec, sub, v := splitConfigKey("filter.My.Driver.smudge")
	if sec != "filter" || sub != "My.Driver" || v != "smudge" {
		t.Errorf("splitConfigKey = %q %q %q", sec, sub, v)
	}
}

func TestFilterPins(t *testing.T) {
	entries := []gitConfigEntry{
		{scope: "system", key: "filter.lfs.smudge", value: "system-smudge", hasValue: true},
		{scope: "global", key: "filter.lfs.smudge", value: "global-smudge", hasValue: true},
		{scope: "local", key: "filter.lfs.smudge", value: "repo-smudge", hasValue: true},
		{scope: "local", key: "filter.lfs.required", hasValue: false},
		{scope: "worktree", key: "filter.x.process", value: "evil", hasValue: true},
		{scope: "local", key: "filter.x.other", value: "ignored", hasValue: true},
		{scope: "command", key: "filter.y.clean", value: "cli", hasValue: true},
	}
	want := []configPin{
		{"filter.lfs.smudge", "global-smudge"},
		{"filter.lfs.required", "false"},
		{"filter.x.process", ""},
	}
	if got := filterPins(entries); !reflect.DeepEqual(got, want) {
		t.Errorf("filterPins = %q, want %q", got, want)
	}
}

// HG-02: a valueless trusted boolean (git reads it as true) is pinned as
// true, not as the empty value git reads as false.
func TestFilterPinsValuelessTrustedRequired(t *testing.T) {
	entries := []gitConfigEntry{
		{scope: "global", key: "filter.lfs.required", hasValue: false},
		{scope: "local", key: "filter.lfs.required", value: "false", hasValue: true},
	}
	if got, want := filterPins(entries), []configPin{{"filter.lfs.required", "true"}}; !reflect.DeepEqual(got, want) {
		t.Errorf("filterPins = %q, want %q", got, want)
	}
}

// HG-05: a repository driver whose name contains "=" (which a -c setting
// cannot address, since git splits it at the first "=") is pinned too.
func TestHostGitCommandNeutralizesFilterNameWithEquals(t *testing.T) {
	repo, markers := newFilterRepo(t)
	if err := os.WriteFile(filepath.Join(repo, ".gitattributes"), []byte("*.txt filter=a=b\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	hostRunGit(t, repo, "add", ".gitattributes")
	hostRunGit(t, repo, "commit", "-q", "-m", "driver a=b")
	for _, kv := range evilDriver(markers) {
		hostRunGit(t, repo, "config", strings.Replace(kv[0], "filter.evil.", "filter.a=b.", 1), kv[1])
	}
	exerciseFilters(t, repo)
	assertNoMarkers(t, markers)
}

// pinEnv numbers the settings and leaves an empty list out entirely.
func TestPinEnv(t *testing.T) {
	if got := pinEnv(nil); got != nil {
		t.Errorf("pinEnv(nil) = %q, want nil", got)
	}
	got := pinEnv([]configPin{{"filter.a=b.smudge", ""}, {"filter.a=b.required", "false"}})
	want := []string{
		"GIT_CONFIG_COUNT=2",
		"GIT_CONFIG_KEY_0=filter.a=b.smudge", "GIT_CONFIG_VALUE_0=",
		"GIT_CONFIG_KEY_1=filter.a=b.required", "GIT_CONFIG_VALUE_1=false",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("pinEnv = %q, want %q", got, want)
	}
}
