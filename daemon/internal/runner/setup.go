package runner

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
)

// SetupDirective is the TOOLS.txt line that turns the checkout setup off for a project. The control
// plane writes it from the project's setting; it is a directive for the daemon, never a tool name.
const SetupDirective = "setup: off"

// SetupTimeout bounds one setup step. A slow registry must not hold the card for long: past it the
// step is stopped, the run log says so, and the agent starts anyway.
const SetupTimeout = 10 * time.Minute

// SetupStep is one dependency install the daemon runs in a checkout before the author agent starts.
// The agent's sandbox has no network, so without it a fresh worktree has no packages and the agent
// cannot run the project's tests (the Conductor and Vibe Kanban "setup script" pattern, with the
// commands read from the lockfile the project already has).
type SetupStep struct {
	// Lockfile names the file that chose this step, for the run log.
	Lockfile string
	// Bin is the tool, found on the daemon's PATH; a missing tool skips the step with a notice.
	Bin  string
	Args []string
	// Done is the folder the step installs into ("" for download-only steps whose caches make a
	// repeat fast). When it already exists the step does not run: an agent may have written that
	// folder, and a package manager reads it (uv even runs the Python it finds in .venv), so setup
	// only ever installs into a folder that is not there. Deleting the folder gets a fresh install,
	// which the commit comparison in PrepareCheckout guards like any other.
	Done string
	// gitRule marks a JavaScript step: its lockfile, when it is not as committed, must not fetch a
	// package from Git or pack a local folder (npm runs such a package's prepare script even with
	// --ignore-scripts).
	gitRule bool
}

func (s SetupStep) command() string { return s.Bin + " " + strings.Join(s.Args, " ") }

// SetupSteps reads the checkout's top level and returns the installs its lockfiles ask for, at most
// one per ecosystem. Every step installs exactly what the lockfile pins and none runs the project's
// own scripts or hooks: pnpm ignores .pnpmfile.cjs and plugin pnpmfiles, bun ignores .env files, npm
// links local folders instead of packing them, uv builds nothing and installs no local or workspace
// package, and the Go and Cargo steps only download.
func SetupSteps(dir string) []SetupStep {
	has := func(name string) bool {
		fi, err := os.Lstat(filepath.Join(dir, name))
		return err == nil && fi.Mode().IsRegular()
	}
	var steps []SetupStep
	switch {
	case has("pnpm-lock.yaml"):
		steps = append(steps, SetupStep{Lockfile: "pnpm-lock.yaml", Bin: "pnpm", Args: []string{"install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts", "--config.ignore-pnpmfile=true"}, Done: "node_modules", gitRule: true})
	case has("bun.lock") || has("bun.lockb"):
		lock := "bun.lock"
		if !has(lock) {
			lock = "bun.lockb"
		}
		steps = append(steps, SetupStep{Lockfile: lock, Bin: "bun", Args: []string{"install", "--frozen-lockfile", "--ignore-scripts", "--no-env-file"}, Done: "node_modules", gitRule: true})
	case has("package-lock.json"):
		steps = append(steps, SetupStep{Lockfile: "package-lock.json", Bin: "npm", Args: []string{"ci", "--prefer-offline", "--ignore-scripts", "--install-links=false", "--no-audit", "--no-fund"}, Done: "node_modules", gitRule: true})
	}
	if has("uv.lock") {
		steps = append(steps, SetupStep{Lockfile: "uv.lock", Bin: "uv", Args: []string{"sync", "--frozen", "--no-build", "--no-install-project", "--no-install-workspace", "--no-install-local"}, Done: ".venv"})
	}
	if has("go.sum") {
		steps = append(steps, SetupStep{Lockfile: "go.sum", Bin: "go", Args: []string{"mod", "download"}})
	}
	if has("Cargo.lock") {
		steps = append(steps, SetupStep{Lockfile: "Cargo.lock", Bin: "cargo", Args: []string{"fetch", "--locked"}})
	}
	return steps
}

// SetupWanted reports whether the job's TOOLS.txt leaves the checkout setup on (the default).
func SetupWanted(ws *Workspace) bool {
	b, err := os.ReadFile(filepath.Join(ws.Inputs, "TOOLS.txt"))
	if err != nil {
		return true
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.EqualFold(strings.TrimSpace(line), SetupDirective) {
			return false
		}
	}
	return true
}

// SetupRunner runs one step; tests replace it. It returns the step's combined output.
type SetupRunner func(ctx context.Context, dir string, s SetupStep) ([]byte, error)

func runSetupStep(ctx context.Context, dir string, s SetupStep) ([]byte, error) {
	bin, err := exec.LookPath(s.Bin)
	if err != nil {
		return nil, errSetupToolMissing
	}
	cmd := exec.CommandContext(ctx, bin, s.Args...)
	cmd.Dir = dir
	// The install runs on the host: only what a package manager needs to find its tools, caches,
	// registry and proxy reaches it. No provider key, token, SSH agent or daemon variable does, and
	// CI keeps every tool from prompting.
	cmd.Env = withEnv(SetupEnv(os.Environ(), dir), "CI=1", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0")
	cmd.WaitDelay = 5 * time.Second
	return cmd.CombinedOutput()
}

var errSetupToolMissing = errors.New("tool not found")

// setupEnvKeys are the variables a setup step keeps besides setupEnvPrefixes: the agent's own
// allowlist (AgentEnv) less the CLI login folders, plus what tells a package manager where its
// tools, caches, registry, proxy and certificates are.
var setupEnvKeys = map[string]bool{
	"HOME": true, "USER": true, "LOGNAME": true, "SHELL": true, "PATH": true, "LANG": true, "LANGUAGE": true,
	"TZ": true, "TERM": true, "TMPDIR": true, "NO_COLOR": true, "COLORTERM": true,
	"HTTP_PROXY": true, "HTTPS_PROXY": true, "NO_PROXY": true, "ALL_PROXY": true,
	"http_proxy": true, "https_proxy": true, "no_proxy": true, "all_proxy": true,
	"SSL_CERT_FILE": true, "SSL_CERT_DIR": true, "NODE_EXTRA_CA_CERTS": true,
	"XDG_CONFIG_HOME": true, "XDG_CACHE_HOME": true, "XDG_DATA_HOME": true, "XDG_STATE_HOME": true,
	"GOPATH": true, "GOMODCACHE": true, "GOCACHE": true, "GOROOT": true, "GOPROXY": true, "GOPRIVATE": true,
	"GONOPROXY": true, "GONOSUMDB": true, "GONOSUMCHECK": true, "GOSUMDB": true, "GOINSECURE": true,
	"GOFLAGS": true, "GOTOOLCHAIN": true, "GOENV": true, "NVM_DIR": true,
}

// setupEnvPrefixes are tool families whose variables locate a tool, its cache or its registry.
var setupEnvPrefixes = []string{"LC_", "CARGO_", "RUSTUP_", "UV_", "PNPM_", "NPM_CONFIG_", "BUN_", "MISE_", "ASDF_", "COREPACK_", "VOLTA_"}

// setupSecretWords mark a variable as a credential whatever its family (MISE_GITHUB_TOKEN,
// CARGO_REGISTRIES_X_TOKEN, UV_INDEX_X_PASSWORD, NPM_CONFIG__AUTH): it never reaches setup.
var setupSecretWords = []string{"TOKEN", "SECRET", "PASSWORD", "PASSWD", "AUTH", "CREDENTIAL", "_KEY", "APIKEY", "SESSION", "COOKIE"}

// SetupEnv is the environment of a setup step in the checkout dir: an allowlist, then every name
// that reads as a credential removed. PATH keeps only absolute folders outside the checkout (and
// loses what a package manager put in front of it for the daemon's launcher, and WSL's Windows
// drives), so no program the agent could have written is found by name.
func SetupEnv(environ []string, dir string) []string {
	out := []string{}
	for _, kv := range environ {
		k, v, ok := strings.Cut(kv, "=")
		if !ok || !setupEnvAllowed(k) {
			continue
		}
		if k == "PATH" {
			v = setupPath(v, dir)
		}
		out = append(out, k+"="+v)
	}
	return out
}

func setupEnvAllowed(k string) bool {
	if strings.HasPrefix(k, "CONTROLROD_") || launcherVar(k) {
		return false
	}
	up := strings.ToUpper(k)
	allowed := setupEnvKeys[k]
	for _, p := range setupEnvPrefixes {
		if strings.HasPrefix(up, p) {
			allowed = true
		}
	}
	if !allowed {
		return false
	}
	for _, w := range setupSecretWords {
		if strings.Contains(up, w) {
			return false
		}
	}
	return true
}

func setupPath(v, dir string) string {
	var keep []string
	for _, p := range filepath.SplitList(withoutWindowsDrives(launcherPath(v))) {
		if p == "" || !filepath.IsAbs(p) || (dir != "" && within(filepath.Clean(p), filepath.Clean(dir))) {
			continue
		}
		keep = append(keep, p)
	}
	return strings.Join(keep, string(os.PathListSeparator))
}

// CommitView is what the checkout's bound commit holds at the paths setup compares: each entry's
// Git mode and object id, and a way to read a blob. Only an author run in a linked worktree gets
// setup, and its agent cannot write the worktree's Git administration (validateCheckout), so the
// commit is the one the person chose.
type CommitView struct {
	Entries map[string]CommitEntry
	Blob    func(oid string) ([]byte, error)
}

// CommitEntry is one path in the commit.
type CommitEntry struct{ Mode, OID string }

// SetupBaseline reads the commit setup compares the checkout with; tests replace it.
type SetupBaseline func() (*CommitView, error)

// setupWatchedTop are top-level names (matched without regard to case, the way a macOS file system
// opens them) that can make a package manager, or the version manager shim in front of it, start a
// program they name: npm and pnpm config and hooks, bun and yarn config, other package manifest
// formats, rustup toolchain files (a "path" toolchain runs any folder's binaries), uv config and
// Python version files (uv runs an interpreter path written there), and mise and asdf files.
var setupWatchedTop = []string{
	".npmrc", ".pnpmfile*", "pnpmfile*", "pnpm-workspace.yaml", ".yarnrc*", "bunfig.toml", ".bunfig.toml",
	"package.yaml", "package.json5", "rust-toolchain", "rust-toolchain.toml", "uv.toml", ".python-version*",
	".tool-versions", "mise*.toml", ".mise*.toml", ".rtx*.toml",
}

// setupWatchedDirs are folders whose every file is compared: Cargo's checkout config (a linker,
// runner, rustc wrapper or credential provider there is a program) and mise's config folders.
var setupWatchedDirs = []string{".cargo", ".mise", "mise", ".config/mise"}

// setupWatchedNested are single files below the top level that are compared.
var setupWatchedNested = []string{".config/mise.toml"}

// setupWatchedFields are fields of files an agent edits for honest reasons (adding a dependency),
// compared on their own: package.json's package manager and engine pins (Corepack and pnpm fetch
// and run the version named there) and pyproject.toml's [tool.uv] table.
var setupWatchedFields = map[string][]string{
	"package.json":   {"packageManager", "devEngines", "volta"},
	"pyproject.toml": {"tool.uv"},
}

// maxSetupCompareFile bounds how much of one file is read for the comparison; a larger watched
// file counts as changed.
const maxSetupCompareFile = 8 << 20

// setupConfigChanges lists the watched paths whose state in the checkout is not the commit's: added,
// removed, changed, or reached through a link or as anything but a regular file. A field entry reads
// "package.json packageManager".
func setupConfigChanges(dir string, cv *CommitView) []string {
	paths := map[string]bool{}
	if ents, err := os.ReadDir(dir); err == nil {
		for _, e := range ents {
			if setupWatchedName(e.Name()) {
				paths[e.Name()] = true
			}
		}
	}
	for rel := range cv.Entries {
		if !strings.Contains(rel, "/") && setupWatchedName(rel) {
			paths[rel] = true
		}
	}
	for _, n := range setupWatchedNested {
		paths[n] = true
	}
	for _, d := range setupWatchedDirs {
		for rel := range cv.Entries {
			if strings.HasPrefix(rel, d+"/") {
				paths[rel] = true
			}
		}
		for _, rel := range worktreeFilesUnder(dir, d) {
			paths[rel] = true
		}
	}
	var changed []string
	for rel := range paths {
		if !fileMatchesCommit(dir, rel, cv) {
			changed = append(changed, rel)
		}
	}
	for file, fields := range setupWatchedFields {
		for _, f := range fields {
			if !fieldMatchesCommit(dir, file, f, cv) {
				changed = append(changed, file+" "+f)
			}
		}
	}
	sort.Strings(changed)
	return changed
}

func setupWatchedName(name string) bool {
	low := strings.ToLower(name)
	for _, p := range setupWatchedTop {
		if ok, _ := path.Match(p, low); ok {
			return true
		}
	}
	return false
}

// worktreeFilesUnder lists everything below rel in the checkout, without following links. A link
// or a special file is listed too, so the comparison reports it, and so is rel itself when it is a
// link or not a folder, or when the folder holds too much to list.
func worktreeFilesUnder(dir, rel string) []string {
	root := filepath.Join(dir, filepath.FromSlash(rel))
	st, err := os.Lstat(root)
	if err != nil {
		return nil
	}
	if !st.IsDir() {
		return []string{rel}
	}
	var out []string
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || len(out) > 1000 {
			out = append(out, rel)
			return filepath.SkipAll
		}
		if d.IsDir() {
			return nil
		}
		r, _ := filepath.Rel(dir, p)
		out = append(out, filepath.ToSlash(r))
		return nil
	})
	return out
}

// readCheckoutFile reads the regular file at rel in the checkout without following a link in any
// component. ok is false for a missing path; an error means something is there but it is not a
// plain, readable regular file within the size bound.
func readCheckoutFile(dir, rel string) (b []byte, ok bool, err error) {
	cur := dir
	parts := strings.Split(rel, "/")
	for i, part := range parts {
		cur = filepath.Join(cur, part)
		st, lerr := os.Lstat(cur)
		if errors.Is(lerr, fs.ErrNotExist) {
			return nil, false, nil
		}
		if lerr != nil {
			return nil, true, lerr
		}
		if st.Mode()&fs.ModeSymlink != 0 {
			return nil, true, errors.New("a link")
		}
		if i < len(parts)-1 && !st.IsDir() {
			return nil, true, errors.New("not a folder")
		}
		if i == len(parts)-1 && !st.Mode().IsRegular() {
			return nil, true, errors.New("not a regular file")
		}
	}
	f, err := os.OpenFile(cur, os.O_RDONLY|syscallNoFollow, 0)
	if err != nil {
		return nil, true, err
	}
	defer f.Close()
	b, err = io.ReadAll(io.LimitReader(f, maxSetupCompareFile+1))
	if err == nil && len(b) > maxSetupCompareFile {
		err = errors.New("too large to compare")
	}
	return b, true, err
}

// fileMatchesCommit reports whether rel is the same in the checkout and the commit: absent from
// both, or a regular file in both with exactly the committed bytes.
func fileMatchesCommit(dir, rel string, cv *CommitView) bool {
	b, ok, err := readCheckoutFile(dir, rel)
	if err != nil {
		return false
	}
	e, inCommit := cv.Entries[rel]
	if !ok || !inCommit {
		return !ok && !inCommit
	}
	if e.Mode != "100644" && e.Mode != "100755" {
		return false
	}
	return blobID(b, len(e.OID)) == e.OID
}

// fieldMatchesCommit compares one field of a manifest in the checkout and the commit. A file absent
// from both matches; a file that cannot be read or parsed on either side does not.
func fieldMatchesCommit(dir, file, field string, cv *CommitView) bool {
	b, ok, err := readCheckoutFile(dir, file)
	if err != nil {
		return false
	}
	e, inCommit := cv.Entries[file]
	var committed []byte
	if inCommit {
		if e.Mode != "100644" && e.Mode != "100755" {
			return false
		}
		if cv.Blob == nil {
			return false
		}
		if committed, err = cv.Blob(e.OID); err != nil {
			return false
		}
	}
	now, nerr := manifestField(file, b, ok, field)
	was, werr := manifestField(file, committed, inCommit, field)
	if nerr != nil || werr != nil {
		return false
	}
	return bytes.Equal(now, was)
}

// manifestField is a canonical encoding of one field (a dotted path in TOML), or nil when the file
// or the field is absent.
func manifestField(file string, b []byte, present bool, field string) ([]byte, error) {
	if !present {
		return nil, nil
	}
	var m map[string]any
	if strings.HasSuffix(file, ".json") {
		if err := json.Unmarshal(b, &m); err != nil {
			return nil, err
		}
	} else if _, err := toml.Decode(string(b), &m); err != nil {
		return nil, err
	}
	var v any = m
	for _, k := range strings.Split(field, ".") {
		mm, ok := v.(map[string]any)
		if !ok {
			return nil, nil
		}
		if v, ok = mm[k]; !ok {
			return nil, nil
		}
	}
	return json.Marshal(v) // map keys are sorted, so equal values encode alike
}

// blobID is Git's object id for a blob with this content: SHA-1, or SHA-256 for a repository in
// the SHA-256 object format (a 64-digit id).
func blobID(b []byte, idLen int) string {
	data := append([]byte(fmt.Sprintf("blob %d\x00", len(b))), b...)
	if idLen == 64 {
		sum := sha256.Sum256(data)
		return hex.EncodeToString(sum[:])
	}
	sum := sha1.Sum(data)
	return hex.EncodeToString(sum[:])
}

// gitBaseline reads the commit's top level, the watched folders and nested files, and the blobs of
// manifests with watched fields, through the hardened host Git (no hooks, filters pinned). The
// commit is named by its id, so no ref the checkout could hold is consulted.
func gitBaseline(dir, head string) SetupBaseline {
	return func() (*CommitView, error) {
		if head == "" {
			return nil, errors.New("the checkout has no bound commit")
		}
		cv := &CommitView{Entries: map[string]CommitEntry{}}
		list := func(args ...string) error {
			out, err := checkoutGitRaw(dir, args...)
			if err != nil {
				return err
			}
			for _, rec := range bytes.Split(out, []byte{0}) {
				meta, name, ok := bytes.Cut(rec, []byte{'\t'})
				if !ok {
					continue
				}
				f := strings.Fields(string(meta))
				if len(f) != 3 {
					continue
				}
				cv.Entries[string(name)] = CommitEntry{Mode: f[0], OID: f[2]}
			}
			return nil
		}
		if err := list("ls-tree", "-z", "--full-tree", head); err != nil {
			return nil, err
		}
		deep := append(append([]string{"ls-tree", "-r", "-z", "--full-tree", head, "--"}, setupWatchedDirs...), setupWatchedNested...)
		if err := list(deep...); err != nil {
			return nil, err
		}
		cv.Blob = func(oid string) ([]byte, error) { return checkoutGitRaw(dir, "cat-file", "blob", oid) }
		return cv, nil
	}
}

// checkoutGitRaw is checkoutGit with the output kept byte for byte.
func checkoutGitRaw(dir string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), hostGitVerifyTimeout)
	defer cancel()
	cmd, err := HostGitCommand(ctx, dir, args...)
	if err != nil {
		return nil, err
	}
	b, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("read the checkout's commit: %w", err)
	}
	return b, nil
}

var (
	pnpmGitSource = regexp.MustCompile(`\btype:\s*['"]?git\b`)
	bunGitSource  = regexp.MustCompile(`git\+|git://|github:|gitlab:|bitbucket:|gist:`)
)

// namesUnsafeSource reports whether a JavaScript lockfile fetches a package from Git or packs a
// local folder: npm prepares such a package by running its scripts, --ignore-scripts or not. A
// lockfile that cannot be read counts as unsafe.
func namesUnsafeSource(lockfile string, b []byte) bool {
	switch lockfile {
	case "pnpm-lock.yaml":
		return pnpmGitSource.Match(b)
	case "bun.lock", "bun.lockb":
		return bunGitSource.Match(b)
	case "package-lock.json":
		var lock struct {
			Packages     map[string]npmLockEntry `json:"packages"`
			Dependencies map[string]npmLockEntry `json:"dependencies"`
		}
		if json.Unmarshal(b, &lock) != nil {
			return true
		}
		for name, e := range lock.Packages {
			if name != "" && !e.Link && e.Resolved != "" && !remoteTarball(e.Resolved) {
				return true
			}
		}
		return npmV1Unsafe(lock.Dependencies)
	}
	return true
}

type npmLockEntry struct {
	Resolved     string                  `json:"resolved"`
	Version      string                  `json:"version"`
	Link         bool                    `json:"link"`
	Dependencies map[string]npmLockEntry `json:"dependencies"`
}

func remoteTarball(s string) bool {
	return strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://")
}

// npmV1Unsafe checks a lockfile version 1 tree, where a Git or folder package shows as a version
// or resolved value with a scheme (git+ssh:, github:, file:).
func npmV1Unsafe(deps map[string]npmLockEntry) bool {
	for _, e := range deps {
		for _, v := range []string{e.Resolved, e.Version} {
			if strings.Contains(v, ":") && !remoteTarball(v) && !strings.HasPrefix(v, "npm:") {
				return true
			}
		}
		if npmV1Unsafe(e.Dependencies) {
			return true
		}
	}
	return false
}

// PrepareCheckout runs the checkout's setup steps and returns one plain notice per step for the run
// log. It never fails the run: a step that cannot run, fails or times out is said in plain words and
// the agent starts anyway, so the person sees why tests may not run instead of a stuck card.
//
// The install runs on the host, outside the agent's sandbox, in a folder an earlier round's agent
// could write. So nothing runs unless every file that can make a package manager start a program is
// exactly as committed (a nil baseline counts as not comparable); no step installs into a folder
// that is already there; and a JavaScript lockfile that is not as committed may not name a Git or
// local-folder package.
func PrepareCheckout(ctx context.Context, dir string, baseline SetupBaseline, run SetupRunner, now func() time.Time) []Event {
	if run == nil {
		run = runSetupStep
	}
	var events []Event
	note := func(text string) {
		events = append(events, Event{Kind: EvNotice, At: now().UTC().Format(time.RFC3339Nano), Text: clipText(text)})
	}
	steps := SetupSteps(dir)
	if len(steps) == 0 {
		return nil
	}
	var cv *CommitView
	err := errors.New("nothing to compare it with")
	if baseline != nil {
		cv, err = baseline()
	}
	if err != nil {
		note(fmt.Sprintf("Setup: skipped, because the checkout could not be compared with its commit (%v). The agent starts without installing packages.", err))
		return events
	}
	if changed := setupConfigChanges(dir, cv); len(changed) > 0 {
		if len(changed) > 8 {
			changed = append(changed[:8], fmt.Sprintf("and %d more", len(changed)-8))
		}
		note(fmt.Sprintf("Setup: skipped, because these files are not as committed and a package manager could run a program they name: %s. The agent starts without installing packages. Commit or undo the change to install again.", strings.Join(changed, ", ")))
		return events
	}
	for _, s := range steps {
		if s.Done != "" {
			if _, err := os.Lstat(filepath.Join(dir, s.Done)); err == nil {
				note(fmt.Sprintf("Setup: kept the %s folder that is already there and did not install from %s. Setup never installs into a folder an agent could have changed; delete the folder to install again.", s.Done, s.Lockfile))
				continue
			}
		}
		if s.gitRule && !fileMatchesCommit(dir, s.Lockfile, cv) {
			if b, _, err := readCheckoutFile(dir, s.Lockfile); err != nil || namesUnsafeSource(s.Lockfile, b) {
				note(fmt.Sprintf("Setup: skipped %q, because %s is not as committed and names a package from Git or a local folder, whose own scripts the install could run. The agent starts without those packages.", s.command(), s.Lockfile))
				continue
			}
		}
		stepCtx, cancel := context.WithTimeout(ctx, SetupTimeout)
		start := now()
		out, err := run(stepCtx, dir, s)
		timedOut := errors.Is(stepCtx.Err(), context.DeadlineExceeded)
		cancel()
		switch {
		case errors.Is(err, errSetupToolMissing):
			note(fmt.Sprintf("Setup: skipped %q because %s is not installed on this computer. The agent starts without those packages.", s.command(), s.Bin))
		case ctx.Err() != nil:
			note("Setup: stopped because the run was stopped.")
			return events
		case timedOut:
			note(fmt.Sprintf("Setup: %q took longer than %s and was stopped. The agent starts anyway; tests that need those packages may not run.", s.command(), SetupTimeout))
		case err != nil:
			note(fmt.Sprintf("Setup: %q failed (%v). The agent starts anyway; tests that need those packages may not run. Last output: %s", s.command(), err, outputTail(out, 600)))
		default:
			note(fmt.Sprintf("Setup: installed from %s with %q in %s.", s.Lockfile, s.command(), now().Sub(start).Round(time.Second)))
		}
	}
	return events
}

// outputTail is the last n bytes of out, trimmed, on one line.
func outputTail(out []byte, n int) string {
	s := strings.TrimSpace(string(out))
	if len(s) > n {
		s = "…" + s[len(s)-n:]
	}
	return strings.Join(strings.Fields(s), " ")
}
