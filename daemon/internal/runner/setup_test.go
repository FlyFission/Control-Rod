package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func writeFiles(t *testing.T, dir string, names ...string) {
	t.Helper()
	for _, n := range names {
		writeSetupFile(t, dir, n, "x")
	}
}

func writeSetupFile(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// commitOf is a SetupBaseline whose commit holds exactly these files, with Git's own blob ids.
func commitOf(files map[string]string) SetupBaseline {
	return func() (*CommitView, error) {
		cv := &CommitView{Entries: map[string]CommitEntry{}}
		blobs := map[string][]byte{}
		for name, content := range files {
			oid := blobID([]byte(content), 40)
			cv.Entries[name] = CommitEntry{Mode: "100644", OID: oid}
			blobs[oid] = []byte(content)
		}
		cv.Blob = func(oid string) ([]byte, error) {
			if b, ok := blobs[oid]; ok {
				return b, nil
			}
			return nil, errors.New("no such blob")
		}
		return cv, nil
	}
}

// emptyCommit is a commit with none of the watched files.
var emptyCommit = commitOf(nil)

func TestSetupStepsFollowTheLockfilesAndNeverRunProjectScripts(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml", "package-lock.json", "uv.lock", "go.sum", "Cargo.lock")
	steps := SetupSteps(dir)
	var got []string
	for _, s := range steps {
		got = append(got, s.Lockfile)
		js := s.Bin == "pnpm" || s.Bin == "npm" || s.Bin == "bun"
		if js && !slices.Contains(s.Args, "--ignore-scripts") {
			t.Errorf("%s runs the project's scripts outside the sandbox: %v", s.Bin, s.Args)
		}
		if s.Bin == "pnpm" && !slices.Contains(s.Args, "--config.ignore-pnpmfile=true") {
			t.Errorf("pnpm loads the checkout's .pnpmfile.cjs: %v", s.Args)
		}
		if s.Bin == "npm" && !slices.Contains(s.Args, "--install-links=false") {
			t.Errorf("npm may pack a local folder and run its prepare script: %v", s.Args)
		}
		if s.Bin == "uv" {
			for _, want := range []string{"--no-build", "--no-install-project", "--no-install-workspace", "--no-install-local"} {
				if !slices.Contains(s.Args, want) {
					t.Errorf("uv may build code from the checkout, missing %s: %v", want, s.Args)
				}
			}
		}
	}
	// One JavaScript install only, and pnpm wins over a stray package-lock.json.
	if want := []string{"pnpm-lock.yaml", "uv.lock", "go.sum", "Cargo.lock"}; !slices.Equal(got, want) {
		t.Fatalf("steps %v, want %v", got, want)
	}
	if SetupSteps(t.TempDir()) != nil {
		t.Fatal("a folder with no lockfile has setup steps")
	}
	bun := t.TempDir()
	writeFiles(t, bun, "bun.lock")
	if s := SetupSteps(bun); len(s) != 1 || !slices.Contains(s[0].Args, "--no-env-file") {
		t.Fatalf("bun loads the checkout's .env files: %v", s)
	}
}

func TestSetupStepsIgnoreALockfileThatIsALink(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "real.yaml")
	if err := os.Symlink(filepath.Join(dir, "real.yaml"), filepath.Join(dir, "pnpm-lock.yaml")); err != nil {
		t.Fatal(err)
	}
	if s := SetupSteps(dir); s != nil {
		t.Fatalf("a linked lockfile chose steps: %v", s)
	}
}

func TestSetupDirectiveTurnsSetupOffAndIsNotATool(t *testing.T) {
	dir := t.TempDir()
	ws := &Workspace{Inputs: dir}
	if !SetupWanted(ws) {
		t.Fatal("setup is off with no TOOLS.txt")
	}
	if err := os.WriteFile(filepath.Join(dir, "TOOLS.txt"), []byte("Read\nSetup: OFF\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if SetupWanted(ws) {
		t.Fatal("setup still on after the directive")
	}
	if tools, _ := readTools(ws); !slices.Equal(tools, []string{"Read"}) {
		t.Fatalf("the directive reached the tool list: %v", tools)
	}
}

func TestPrepareCheckoutNeverBlocksAndSaysWhatHappened(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml", "go.sum", "Cargo.lock")
	var ran []string
	run := func(_ context.Context, d string, s SetupStep) ([]byte, error) {
		if d != dir {
			t.Errorf("ran in %s", d)
		}
		ran = append(ran, s.Bin)
		switch s.Bin {
		case "pnpm":
			return []byte("ERR_PNPM_FETCH_404 left-pad"), errors.New("exit status 1")
		case "go":
			return nil, errSetupToolMissing
		}
		return nil, nil
	}
	events := PrepareCheckout(context.Background(), dir, emptyCommit, run, time.Now)
	if !slices.Equal(ran, []string{"pnpm", "go", "cargo"}) {
		t.Fatalf("ran %v", ran)
	}
	if len(events) != 3 {
		t.Fatalf("%d notices, want one per step: %v", len(events), events)
	}
	for i, want := range []string{"failed", "not installed", "installed from Cargo.lock"} {
		if events[i].Kind != EvNotice || !strings.Contains(events[i].Text, want) {
			t.Errorf("notice %d = %q, want it to say %q", i, events[i].Text, want)
		}
	}
	if !strings.Contains(events[0].Text, "ERR_PNPM_FETCH_404") {
		t.Errorf("the failure does not show the tool's output: %q", events[0].Text)
	}
}

// A package folder that is already there may hold what an agent wrote (uv runs .venv's Python), so
// setup never installs into it, and says so.
func TestPrepareCheckoutNeverInstallsIntoAnExistingFolder(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "pnpm-lock.yaml", "uv.lock", "go.sum")
	for _, d := range []string{"node_modules", ".venv"} {
		if err := os.Mkdir(filepath.Join(dir, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	var ran []string
	run := func(_ context.Context, _ string, s SetupStep) ([]byte, error) {
		ran = append(ran, s.Bin)
		return nil, nil
	}
	ev := PrepareCheckout(context.Background(), dir, emptyCommit, run, time.Now)
	if !slices.Equal(ran, []string{"go"}) {
		t.Fatalf("ran %v, want only the download-only step", ran)
	}
	if len(ev) != 3 || !strings.Contains(ev[0].Text, "kept the node_modules folder") || !strings.Contains(ev[1].Text, "kept the .venv folder") {
		t.Fatalf("notices %v", ev)
	}
}

func TestPrepareCheckoutStopsWithTheRun(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "go.sum", "Cargo.lock")
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	run := func(c context.Context, _ string, _ SetupStep) ([]byte, error) {
		calls++
		cancel()
		return nil, c.Err()
	}
	ev := PrepareCheckout(ctx, dir, emptyCommit, run, time.Now)
	if calls != 1 || len(ev) != 1 || !strings.Contains(ev[0].Text, "stopped") {
		t.Fatalf("calls %d, notices %v", calls, ev)
	}
}

func refuseRun(t *testing.T) SetupRunner {
	return func(_ context.Context, _ string, s SetupStep) ([]byte, error) {
		t.Errorf("%s ran in a checkout whose program-naming files are not as committed", s.Bin)
		return nil, nil
	}
}

// Every file an agent could plant to make a package manager, or the version manager in front of
// it, start a program stops the whole setup, and the notice names it.
func TestPrepareCheckoutRefusesPlantedProgramConfig(t *testing.T) {
	for name, content := range map[string]string{
		".pnpmfile.cjs":              "require('child_process').execSync('id')",
		".pnpmfile.mjs":              "export default {}",
		".npmrc":                     "git=/tmp/evil\n",
		".NPMRC":                     "git=/tmp/evil\n",
		"pnpm-workspace.yaml":        "pnpmfile: ./evil.cjs\n",
		".yarnrc.yml":                "yarnPath: ./evil.cjs\n",
		"bunfig.toml":                "[install]\n",
		"package.yaml":               "name: x\n",
		".cargo/config.toml":         "[build]\nrustc-wrapper = \"./evil\"\n",
		".cargo/config":              "[target.x86_64-unknown-linux-gnu]\nlinker = \"./evil\"\n",
		"rust-toolchain.toml":        "[toolchain]\npath = \"./evil\"\n",
		"rust-toolchain":             "./evil\n",
		"uv.toml":                    "keyring-provider = \"subprocess\"\n",
		".python-version":            "./evil\n",
		"mise.toml":                  "[env]\n_.source = \"./evil.sh\"\n",
		".mise.local.toml":           "[env]\n",
		".config/mise/conf.d/x.toml": "[env]\n",
		".config/mise.toml":          "[env]\n",
		".tool-versions":             "nodejs path:./evil\n",
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			writeFiles(t, dir, "pnpm-lock.yaml", "uv.lock", "Cargo.lock", "go.sum")
			writeSetupFile(t, dir, name, content)
			ev := PrepareCheckout(context.Background(), dir, emptyCommit, refuseRun(t), time.Now)
			if len(ev) != 1 || !strings.Contains(ev[0].Text, "not as committed") || !strings.Contains(ev[0].Text, name) {
				t.Fatalf("notices %v", ev)
			}
		})
	}
}

func TestPrepareCheckoutComparesWithTheCommit(t *testing.T) {
	const npmrc = "auto-install-peers=true\n"
	committed := map[string]string{
		".npmrc":         npmrc,
		"package.json":   `{"name":"x","packageManager":"pnpm@10.28.0","dependencies":{"a":"1"}}`,
		"pyproject.toml": "[project]\nname = \"x\"\ndependencies = []\n[tool.uv]\npackage = false\n",
	}
	setup := func(t *testing.T, edit func(dir string)) []Event {
		dir := t.TempDir()
		writeFiles(t, dir, "pnpm-lock.yaml", "go.sum")
		for n, c := range committed {
			writeSetupFile(t, dir, n, c)
		}
		edit(dir)
		return PrepareCheckout(context.Background(), dir, commitOf(committed), func(context.Context, string, SetupStep) ([]byte, error) { return nil, nil }, time.Now)
	}
	ran := func(ev []Event) bool { return len(ev) == 2 && strings.Contains(ev[0].Text, "installed from") }

	if ev := setup(t, func(string) {}); !ran(ev) {
		t.Fatalf("an unchanged checkout did not install: %v", ev)
	}
	// Honest edits an agent makes to add a dependency leave setup on.
	if ev := setup(t, func(dir string) {
		writeSetupFile(t, dir, "package.json", `{"name":"x","packageManager":"pnpm@10.28.0","dependencies":{"a":"1","b":"2"}}`)
		writeSetupFile(t, dir, "pyproject.toml", "[project]\nname = \"x\"\ndependencies = [\"b\"]\n[tool.uv]\npackage = false\n")
	}); !ran(ev) {
		t.Fatalf("adding a dependency stopped setup: %v", ev)
	}
	for what, edit := range map[string]func(dir string){
		".npmrc changed": func(dir string) { writeSetupFile(t, dir, ".npmrc", npmrc+"git=/tmp/evil\n") },
		".npmrc removed": func(dir string) { _ = os.Remove(filepath.Join(dir, ".npmrc")) },
		".npmrc a link": func(dir string) {
			writeSetupFile(t, dir, "elsewhere", npmrc)
			_ = os.Remove(filepath.Join(dir, ".npmrc"))
			if err := os.Symlink(filepath.Join(dir, "elsewhere"), filepath.Join(dir, ".npmrc")); err != nil {
				t.Fatal(err)
			}
		},
		"package.json packageManager": func(dir string) {
			writeSetupFile(t, dir, "package.json", `{"name":"x","packageManager":"pnpm@https://example.com/evil.tgz","dependencies":{"a":"1"}}`)
		},
		"package.json unreadable": func(dir string) { writeSetupFile(t, dir, "package.json", "{") },
		"pyproject.toml tool.uv": func(dir string) {
			writeSetupFile(t, dir, "pyproject.toml", "[project]\nname = \"x\"\n[tool.uv]\nkeyring-provider = \"subprocess\"\n")
		},
	} {
		t.Run(what, func(t *testing.T) {
			if ev := setup(t, edit); len(ev) != 1 || !strings.Contains(ev[0].Text, "not as committed") {
				t.Fatalf("notices %v", ev)
			}
		})
	}
}

func TestPrepareCheckoutWithoutACommitRunsNothing(t *testing.T) {
	dir := t.TempDir()
	writeFiles(t, dir, "go.sum")
	for _, b := range []SetupBaseline{nil, func() (*CommitView, error) { return nil, errors.New("git failed") }} {
		ev := PrepareCheckout(context.Background(), dir, b, refuseRun(t), time.Now)
		if len(ev) != 1 || !strings.Contains(ev[0].Text, "could not be compared") {
			t.Fatalf("notices %v", ev)
		}
	}
}

// A JavaScript lockfile that is not as committed may not name a package from Git or a local
// folder: npm runs such a package's prepare script even with --ignore-scripts.
func TestPrepareCheckoutRefusesAChangedLockfileWithAGitPackage(t *testing.T) {
	const npmGit = `{"lockfileVersion":3,"packages":{"":{"name":"x"},"node_modules/evil":{"resolved":"git+ssh://git@example.com/evil.git#abc"}}}`
	const npmFolder = `{"lockfileVersion":3,"packages":{"":{"name":"x"},"node_modules/evil":{"resolved":"file:../evil"}}}`
	const npmV1 = `{"lockfileVersion":1,"dependencies":{"evil":{"version":"github:example/evil#abc"}}}`
	const npmSafe = `{"lockfileVersion":3,"packages":{"":{"name":"x"},"node_modules/a":{"resolved":"https://registry.npmjs.org/a/-/a-1.0.0.tgz"},"node_modules/w":{"resolved":"packages/w","link":true}}}`
	for _, tc := range []struct {
		name, lock, content string
		committed           bool
		runs                bool
	}{
		{"npm git", "package-lock.json", npmGit, false, false},
		{"npm folder", "package-lock.json", npmFolder, false, false},
		{"npm v1 github", "package-lock.json", npmV1, false, false},
		{"npm unreadable", "package-lock.json", "{", false, false},
		{"npm registry and workspace links", "package-lock.json", npmSafe, false, true},
		{"npm git as committed", "package-lock.json", npmGit, true, true},
		{"pnpm git", "pnpm-lock.yaml", "packages:\n  evil@git+https://example.com/evil.git:\n    resolution: {commit: abc, repo: https://example.com/evil.git, type: git}\n", false, false},
		{"pnpm registry", "pnpm-lock.yaml", "packages:\n  a@1.0.0:\n    resolution: {integrity: sha512-x}\n", false, true},
		{"bun github", "bun.lock", `{"packages":{"evil":["evil@github:example/evil#abc"]}}`, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeSetupFile(t, dir, tc.lock, tc.content)
			writeFiles(t, dir, "go.sum")
			commit := map[string]string{}
			if tc.committed {
				commit[tc.lock] = tc.content
			}
			var ran []string
			run := func(_ context.Context, _ string, s SetupStep) ([]byte, error) {
				ran = append(ran, s.Bin)
				return nil, nil
			}
			ev := PrepareCheckout(context.Background(), dir, commitOf(commit), run, time.Now)
			js := len(ran) == 2
			if js != tc.runs || !slices.Contains(ran, "go") {
				t.Fatalf("ran %v (want the JavaScript step: %v); notices %v", ran, tc.runs, ev)
			}
			if !tc.runs && !strings.Contains(ev[0].Text, "Git or a local folder") {
				t.Fatalf("notice %q", ev[0].Text)
			}
		})
	}
}

// setupEnvSecrets are variables a setup step must never see.
var setupEnvSecrets = []string{
	"ANTHROPIC_API_KEY=sk-ant", "OPENAI_API_KEY=sk", "GITHUB_TOKEN=ghp", "GH_TOKEN=ghp", "SSH_AUTH_SOCK=/tmp/agent.sock",
	"AWS_SECRET_ACCESS_KEY=x", "AWS_ACCESS_KEY_ID=x", "NPM_TOKEN=x", "MISE_GITHUB_TOKEN=x", "NPM_CONFIG__AUTH=x",
	"CARGO_REGISTRIES_MINE_TOKEN=x", "UV_INDEX_MINE_PASSWORD=x", "CONTROLROD_DAEMON_TOKEN=x", "CONTROLROD_API=http://x",
	"GIT_ASKPASS=/x", "XDG_RUNTIME_DIR=/run/user/1", "DBUS_SESSION_BUS_ADDRESS=unix:x", "GOOGLE_APPLICATION_CREDENTIALS=/x",
	"NODE_OPTIONS=--require ./evil.js", "VIRTUAL_ENV=/x", "npm_config_userconfig=/x",
}

func TestSetupEnvKeepsSecretsAndCheckoutProgramsOut(t *testing.T) {
	dir := "/home/u/projects/app"
	env := append([]string{
		"HOME=/home/u", "PATH=/usr/bin:node_modules/.bin:.:" + dir + "/bin:/home/u/.cargo/bin:/mnt/c/Windows",
		"GOPROXY=https://proxy.example", "CARGO_HOME=/home/u/.cargo", "HTTPS_PROXY=http://proxy:3128", "UV_CACHE_DIR=/c",
		"PNPM_HOME=/p", "LC_ALL=C", "XDG_CACHE_HOME=/home/u/.cache",
	}, setupEnvSecrets...)
	got := SetupEnv(env, dir)
	for _, s := range setupEnvSecrets {
		k, _, _ := strings.Cut(s, "=")
		if envValue(got, k) != "" {
			t.Errorf("setup sees %s", k)
		}
	}
	for _, keep := range []string{"HOME", "GOPROXY", "CARGO_HOME", "HTTPS_PROXY", "UV_CACHE_DIR", "PNPM_HOME", "LC_ALL", "XDG_CACHE_HOME"} {
		if envValue(got, keep) == "" {
			t.Errorf("setup lost %s", keep)
		}
	}
	if p := envValue(got, "PATH"); p != "/usr/bin:/home/u/.cargo/bin" {
		t.Errorf("PATH = %q: relative, checkout and Windows folders must go", p)
	}
}

func TestRealSetupStepKeepsTheDaemonSecretsOut(t *testing.T) {
	dir := t.TempDir()
	for _, s := range setupEnvSecrets {
		k, v, _ := strings.Cut(s, "=")
		t.Setenv(k, v)
	}
	out, err := runSetupStep(context.Background(), dir, SetupStep{Bin: "env"})
	if err != nil {
		t.Skip("no env tool:", err)
	}
	for _, s := range setupEnvSecrets {
		k, _, _ := strings.Cut(s, "=")
		if strings.Contains(string(out), k+"=") {
			t.Errorf("the setup step saw %s", k)
		}
	}
	if !strings.Contains(string(out), "CI=1") {
		t.Fatal("the setup step can prompt")
	}
	if _, err := runSetupStep(context.Background(), dir, SetupStep{Bin: "no-such-tool-controlrod"}); !errors.Is(err, errSetupToolMissing) {
		t.Fatalf("missing tool gave %v", err)
	}
}

// With the real pnpm, a planted .pnpmfile.cjs never runs: the step passes
// --config.ignore-pnpmfile=true (checked without the commit comparison in front of it).
func TestRealPnpmNeverLoadsAPlantedPnpmfile(t *testing.T) {
	if _, err := exec.LookPath("pnpm"); err != nil {
		t.Skip("pnpm is not installed")
	}
	dir := t.TempDir()
	writeSetupFile(t, dir, "package.json", `{"name":"x","version":"1.0.0"}`)
	writeSetupFile(t, dir, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n")
	marker := filepath.Join(t.TempDir(), "pnpmfile-ran")
	writeSetupFile(t, dir, ".pnpmfile.cjs", "require('fs').writeFileSync("+jsString(marker)+", 'x'); module.exports = { hooks: {} }\n")
	steps := SetupSteps(dir)
	if len(steps) != 1 || steps[0].Bin != "pnpm" {
		t.Fatalf("steps %v", steps)
	}
	out, err := runSetupStep(context.Background(), dir, steps[0])
	if _, serr := os.Stat(marker); serr == nil {
		t.Fatalf("pnpm ran the planted .pnpmfile.cjs: %s", out)
	}
	if err != nil {
		t.Logf("pnpm did not finish here (%v): %s", err, out)
	}
}

func jsString(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}

// The sandbox escape (review finding DMN-1), end to end: round one's agent plants a .pnpmfile.cjs,
// an .npmrc naming a program for git, and a lockfile that fetches from Git. Round two's setup runs
// none of it, with the real tools and real Git, and the agent still runs.
func TestAgentPlantedSetupConfigNeverRunsOnTheHost(t *testing.T) {
	b := checkoutFixture(t)
	markers := t.TempDir()
	evil := filepath.Join(markers, "evil.sh")
	if err := os.WriteFile(evil, []byte("#!/bin/sh\ntouch "+filepath.Join(markers, "ran-$$")+"\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	plant := "#!/bin/sh\nset -eu\n" +
		"printf '{\"name\":\"x\",\"version\":\"1.0.0\"}' > package.json\n" +
		"printf 'lockfileVersion: 9.0\\n' > pnpm-lock.yaml\n" +
		"printf \"require('child_process').execSync('" + evil + "')\\n\" > .pnpmfile.cjs\n" +
		"printf 'git=" + evil + "\\nscript-shell=" + evil + "\\n' > .npmrc\n" +
		"printf 'after\\n' > project.txt\n"
	d := quietDaemon(t)
	if _, err := d.execute(context.Background(), authorCheckoutJob(t, "plant-round-1", b, plant)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(b.Path, ".pnpmfile.cjs")); err != nil {
		t.Fatalf("round one did not plant: %v", err)
	}
	// Round two, with the daemon's real setup runner.
	d.setup = nil
	if _, err := d.execute(context.Background(), authorCheckoutJob(t, "plant-round-2", b, checkoutEditScript)); err != nil {
		t.Fatal(err)
	}
	if ran, _ := filepath.Glob(filepath.Join(markers, "ran-*")); len(ran) > 0 {
		t.Fatalf("setup ran a program the agent planted: %v", ran)
	}
	// And the commit comparison is what stopped it: a recorder sees no step at all.
	var steps []string
	d.setup = func(_ context.Context, _ string, s SetupStep) ([]byte, error) {
		steps = append(steps, s.Bin)
		return nil, nil
	}
	if _, err := d.execute(context.Background(), authorCheckoutJob(t, "plant-round-3", b, checkoutEditScript)); err != nil {
		t.Fatal(err)
	}
	if len(steps) != 0 {
		t.Fatalf("setup ran %v in a checkout with planted config", steps)
	}
}

// gitBaseline reads the bound commit by id through host Git, so the comparison sees exactly what
// was committed.
func TestGitBaselineReadsTheBoundCommit(t *testing.T) {
	b := checkoutFixture(t)
	cv, err := gitBaseline(b.Path, b.Head)()
	if err != nil {
		t.Fatal(err)
	}
	if e, ok := cv.Entries["project.txt"]; !ok || e.OID != blobID([]byte("before\n"), len(e.OID)) {
		t.Fatalf("project.txt entry %v", cv.Entries)
	}
	if !fileMatchesCommit(b.Path, "project.txt", cv) {
		t.Fatal("the committed file does not match itself")
	}
	writeSetupFile(t, b.Path, "project.txt", "after\n")
	if fileMatchesCommit(b.Path, "project.txt", cv) {
		t.Fatal("an edited file matches the commit")
	}
	if _, err := gitBaseline(b.Path, "")(); err == nil {
		t.Fatal("no bound commit gave a baseline")
	}
}
