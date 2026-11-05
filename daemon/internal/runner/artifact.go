package runner

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"time"
)

// RuntimeArtifact is one runtime as found on this machine (specification 21): the native
// executable that actually runs and the SHA-256 that identifies it. For a runtime that ships its
// executable with helper files (Codex's platform package: the binary, rg, bwrap), the digest covers
// that whole directory, so replacing any part of it changes the artifact. Runs launch exactly this.
type RuntimeArtifact struct {
	// Path is the native executable.
	Path   string `json:"path"`
	Digest Digest `json:"digest"`
	// Root, when set, is the directory the digest covers; otherwise it covers Path alone.
	Root string `json:"-"`
	// Env is what the runtime's own launcher would have set, applied when running the executable
	// directly (Codex's npm wrapper names its package root).
	Env []string `json:"-"`
	// exeSum is the executable's own digest as the tree digest counted it.
	exeSum string
}

// RuntimePin names the artifact a run must launch, as the control plane's pin records it.
type RuntimePin struct {
	Runtime string `json:"runtime"`
	Digest  Digest `json:"digest"`
	Version string `json:"version,omitempty"`
}

// maxArtifactBytes bounds the files a probe will hash (each, and a tree in total).
const maxArtifactBytes = 2 << 30

// ErrUnsupportedLauncher means the runtime is started by a script Control Rod cannot pin: the
// bytes that would run are not identified by the script's digest.
var ErrUnsupportedLauncher = errors.New("unsupported runtime launcher")

// resolveArtifact is how probes and launches find an executable; tests replace it.
var resolveArtifact = ResolveArtifact

// ResolveArtifact finds the native executable a runtime runs: the PATH entry with symlinks
// followed, or, for Codex installed through npm, the platform binary its wrapper script would
// execute. Any other script launcher is refused rather than pinned by the script's digest.
func ResolveArtifact(name string) (RuntimeArtifact, error) {
	// Found on the PATH an agent CLI receives, so the daemon never runs something the run itself
	// would not have found (a Windows mount on WSL, a daemon-only folder).
	p, err := LookPathAgent(name)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	entry, err := filepath.Abs(real)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	native, err := isNative(entry)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	if native {
		sum, err := fileDigest(entry)
		if err != nil {
			return RuntimeArtifact{}, err
		}
		return RuntimeArtifact{Path: entry, Digest: Digest{Algorithm: "sha256", Value: sum}}, nil
	}
	if a, ok, err := codexFromWrapper(entry); ok || err != nil {
		return a, err
	}
	return RuntimeArtifact{}, fmt.Errorf("%w: %s starts through the script %s, whose digest does not identify what runs; install %s's native build", ErrUnsupportedLauncher, name, entry, name)
}

// isNative reports whether a file is a native executable (ELF or Mach-O), not a script.
func isNative(path string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer f.Close()
	head := make([]byte, 4)
	if _, err := io.ReadFull(f, head); err != nil {
		return false, nil
	}
	switch {
	case bytes.Equal(head, []byte{0x7f, 'E', 'L', 'F'}):
		return true, nil
	case bytes.Equal(head, []byte{0xcf, 0xfa, 0xed, 0xfe}), bytes.Equal(head, []byte{0xce, 0xfa, 0xed, 0xfe}), bytes.Equal(head, []byte{0xca, 0xfe, 0xba, 0xbe}):
		return true, nil
	}
	return false, nil
}

// codexFromWrapper resolves Codex's npm wrapper (bin/codex.js) to the platform binary it executes:
// <package>/node_modules/@openai/codex-<os>-<arch>/vendor/<triple>/bin/codex, or the same vendor
// layout bundled in the package itself. The artifact is that vendor/<triple> directory.
func codexFromWrapper(entry string) (RuntimeArtifact, bool, error) {
	if filepath.Base(entry) != "codex.js" || filepath.Base(filepath.Dir(entry)) != "bin" {
		return RuntimeArtifact{}, false, nil
	}
	pkg := filepath.Dir(filepath.Dir(entry))
	arch := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	osName := map[string]string{"linux": "linux", "darwin": "darwin"}[runtime.GOOS]
	if arch == "" || osName == "" {
		return RuntimeArtifact{}, true, fmt.Errorf("%w: no Codex platform package for %s/%s", ErrUnsupportedLauncher, runtime.GOOS, runtime.GOARCH)
	}
	for _, vendor := range []string{
		filepath.Join(pkg, "node_modules", "@openai", "codex-"+osName+"-"+arch, "vendor"),
		filepath.Join(pkg, "vendor"),
	} {
		triples, err := os.ReadDir(vendor)
		if err != nil {
			continue
		}
		for _, t := range triples {
			root := filepath.Join(vendor, t.Name())
			exe := filepath.Join(root, "bin", "codex")
			if native, err := isNative(exe); err != nil || !native {
				continue
			}
			sum, files, err := treeDigest(root)
			if err != nil {
				return RuntimeArtifact{}, true, err
			}
			return RuntimeArtifact{Path: exe, Root: root, Digest: Digest{Algorithm: "sha256", Value: sum}, exeSum: files["bin/codex"],
				Env: []string{"CODEX_MANAGED_PACKAGE_ROOT=" + pkg, "CODEX_MANAGED_BY_NPM=1"}}, true, nil
		}
	}
	return RuntimeArtifact{}, true, fmt.Errorf("%w: Codex's wrapper at %s has no native binary for this platform", ErrUnsupportedLauncher, entry)
}

func fileDigest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return readerDigest(f)
}

func readerDigest(r io.Reader) (string, error) {
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(r, maxArtifactBytes+1))
	if err != nil {
		return "", err
	}
	if n > maxArtifactBytes {
		return "", errors.New("the executable is larger than Control Rod will hash")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// treeDigest identifies a directory (hashed in full every time; a cache keyed on file metadata can
// miss a rewrite within one timestamp tick): SHA-256 over each entry's relative path, kind, executable
// bit and content digest (or link target), in sorted order. It also returns each regular file's
// digest by relative path.
func treeDigest(root string) (string, map[string]string, error) {
	type entry struct{ rel, line string }
	var entries []entry
	files := map[string]string{}
	var total int64
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case info.Mode()&fs.ModeSymlink != 0:
			// A link's entry could only record its target string, not what it names; the platform
			// trees carry none, so any link is refused.
			return fmt.Errorf("%s is a symbolic link; a runtime tree with links cannot be identified by digest", rel)
		case info.Mode().IsRegular():
			total += info.Size()
			if total > maxArtifactBytes {
				return errors.New("the runtime is larger than Control Rod will hash")
			}
			sum, err := fileDigest(p)
			if err != nil {
				return err
			}
			exec := "-"
			if info.Mode().Perm()&0o111 != 0 {
				exec = "x"
			}
			files[rel] = sum
			entries = append(entries, entry{rel, "file\x00" + rel + "\x00" + exec + "\x00" + sum})
		case d.IsDir():
			entries = append(entries, entry{rel, "dir\x00" + rel})
		default:
			return fmt.Errorf("%s is not a regular file, directory or link", rel)
		}
		return nil
	})
	if err != nil {
		return "", nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].rel < entries[j].rel })
	h := sha256.New()
	for _, e := range entries {
		h.Write([]byte(e.line))
		h.Write([]byte{'\n'})
	}
	return hex.EncodeToString(h.Sum(nil)), files, nil
}

// StageArtifact copies a verified runtime into a private, content-addressed folder outside the home
// folder and returns it from there, re-hashed (plan task 6.2). Codex re-runs its own executable
// inside its sandbox, and a sandbox that denies the home folder whole cannot reach an install inside
// it; launching the staged copy keeps the home folder denied whole. A copy already staged is reused
// only if its digest still matches; otherwise it is replaced. The tree carries no links (treeDigest).
func StageArtifact(a RuntimeArtifact, base string) (RuntimeArtifact, error) {
	if err := os.MkdirAll(base, 0o700); err != nil {
		return a, err
	}
	if fi, err := os.Lstat(base); err != nil || !fi.IsDir() || fi.Mode().Perm()&0o077 != 0 {
		return a, fmt.Errorf("%s must be a private folder (mode 0700) to stage runtimes in", base)
	}
	// One stager per digest at a time, across daemons: a copy another launch is using is never
	// removed from under it, and two cold launches do not race to publish.
	unlock, err := lockFile(filepath.Join(base, a.Digest.Value+".lock"))
	if err != nil {
		return a, err
	}
	defer unlock()
	src := a.Root
	if src == "" {
		src = filepath.Dir(a.Path)
	}
	rel, err := filepath.Rel(src, a.Path)
	if err != nil {
		return a, err
	}
	dst := filepath.Join(base, a.Digest.Value)
	staged := func() (RuntimeArtifact, error) {
		out := a
		out.Path = filepath.Join(dst, rel)
		if a.Root == "" {
			sum, err := fileDigest(out.Path)
			if err != nil {
				return a, err
			}
			out.Digest = Digest{Algorithm: "sha256", Value: sum}
			return out, nil
		}
		out.Root = dst
		sum, files, err := treeDigest(dst)
		if err != nil {
			return a, err
		}
		out.Digest, out.exeSum = Digest{Algorithm: "sha256", Value: sum}, files[filepath.ToSlash(rel)]
		return out, nil
	}
	if s, err := staged(); err == nil && s.Digest.Value == a.Digest.Value {
		return s, nil
	}
	// A copy that no longer matches was changed after staging: set it aside (a launch already
	// running from it keeps its files) and stage afresh.
	if _, err := os.Lstat(dst); err == nil {
		aside, err := os.MkdirTemp(base, ".stale-")
		if err != nil {
			return a, err
		}
		if err := os.Rename(dst, filepath.Join(aside, "copy")); err != nil {
			return a, err
		}
	}
	tmp, err := os.MkdirTemp(base, ".stage-")
	if err != nil {
		return a, err
	}
	defer os.RemoveAll(tmp)
	copyFile := func(from, to string, mode fs.FileMode) error {
		in, err := os.Open(from)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(to, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode&0o755)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, in); err != nil {
			out.Close()
			return err
		}
		return out.Close()
	}
	if a.Root == "" {
		fi, err := os.Stat(a.Path)
		if err != nil {
			return a, err
		}
		if err := copyFile(a.Path, filepath.Join(tmp, rel), fi.Mode()); err != nil {
			return a, err
		}
	} else if err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		r, _ := filepath.Rel(src, p)
		to := filepath.Join(tmp, r)
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case d.IsDir():
			return os.MkdirAll(to, 0o755)
		case info.Mode().IsRegular():
			return copyFile(p, to, info.Mode())
		default:
			return fmt.Errorf("%s is not a regular file or directory", r)
		}
	}); err != nil {
		return a, err
	}
	if err := os.Rename(tmp, dst); err != nil {
		return a, err
	}
	s, err := staged()
	if err != nil {
		return a, err
	}
	if s.Digest.Value != a.Digest.Value {
		return a, fmt.Errorf("%w: the staged copy of %s does not match it", ErrArtifactMismatch, a.Path)
	}
	return s, nil
}

// StageRoot is where runtimes are staged: a private folder in /tmp (never TMPDIR, which the
// environment could point anywhere), outside the home folder, readable from inside the sandbox and
// read only there (both sandboxes make /tmp read only).
func StageRoot() string {
	tmp := "/tmp"
	if real, err := filepath.EvalSymlinks(tmp); err == nil {
		tmp = real
	}
	return filepath.Join(tmp, fmt.Sprintf("controlrod-runtimes-%d", os.Getuid()))
}

// stagedRuntimes are the runtimes launched from a staged copy.
var stagedRuntimes = map[string]bool{RuntimeCodex: true}

// ErrArtifactMismatch means the executable on disk is not the one the run may launch.
var ErrArtifactMismatch = errors.New("runtime artifact mismatch")

// VerifiedLaunch is a verified runtime ready to start: on Linux an open descriptor of the exact executable
// whose bytes were hashed, started as /proc/self/fd/N so a file swapped at the path afterwards is
// never what runs; elsewhere the verified path.
type VerifiedLaunch struct {
	File   *os.File
	Path   string
	Digest Digest
	Env    []string
	// exeSum is the digest the executable's own bytes must have.
	exeSum string
	// leased is set while a read lease guards the file against writes (Linux).
	leased bool
	// guardedAt is when the lease was taken; the kernel breaks a lease by force after
	// leaseBreakTime, so the start must come well before that.
	guardedAt time.Time
}

// Close releases the descriptor once the process has started.
func (l *VerifiedLaunch) Close() {
	if l != nil && l.File != nil {
		l.File.Close()
	}
}

// VerifyLaunch checks, immediately before launch, that the runtime is the expected artifact: the
// pinned one when a pin exists, otherwise the one the last probe reported. The executable is opened
// first and its digest computed from that open file, so the bytes checked are the bytes that run.
// A mismatch fails closed with a sentence a person can act on.
func VerifyLaunch(runtimeName string, pin *RuntimePin, probed *RuntimeArtifact) (*VerifiedLaunch, error) {
	got, err := resolveArtifact(runtimeName)
	if err != nil {
		return nil, fmt.Errorf("%w: %s cannot be found or read: %v", ErrArtifactMismatch, runtimeName, err)
	}
	if stagedRuntimes[runtimeName] {
		// Launched from its staged copy, checked below exactly as the install would be.
		if got, err = StageArtifact(got, StageRoot()); err != nil {
			return nil, fmt.Errorf("%w: %s cannot be staged outside the home folder: %v", ErrArtifactMismatch, runtimeName, err)
		}
	}
	f, err := os.Open(got.Path)
	if err != nil {
		return nil, fmt.Errorf("%w: %s cannot be opened: %v", ErrArtifactMismatch, runtimeName, err)
	}
	// Guard first, then hash: a write after this point cannot go unseen.
	guardedAt := time.Now()
	leased, err := guardRuntime(f)
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("%w: %v", ErrArtifactMismatch, err)
	}
	digest := got.Digest
	if got.Root == "" {
		// The digest of the very file that will run, read through the open descriptor.
		sum, err := readerDigest(f)
		if err != nil {
			f.Close()
			return nil, fmt.Errorf("%w: %s cannot be read: %v", ErrArtifactMismatch, runtimeName, err)
		}
		digest = Digest{Algorithm: "sha256", Value: sum}
	} else {
		// A tree: the bytes that will run must be the executable the tree digest counted. Helper
		// files in the tree are checked at this moment but run later by the runtime itself.
		sum, err := readerDigest(f)
		if err != nil {
			f.Close()
			return nil, fmt.Errorf("%w: %s cannot be read: %v", ErrArtifactMismatch, runtimeName, err)
		}
		if got.exeSum == "" || sum != got.exeSum {
			f.Close()
			return nil, fmt.Errorf("%w: %s changed while it was being checked", ErrArtifactMismatch, runtimeName)
		}
	}
	fail := func(e error) (*VerifiedLaunch, error) { f.Close(); return nil, e }
	switch {
	case pin != nil && pin.Digest.Value != digest.Value:
		return fail(fmt.Errorf("%w: %s at %s is not the pinned version (digest %s, pinned %s). An administrator must pin the version installed now, or reinstall the pinned one.",
			ErrArtifactMismatch, runtimeName, got.Path, short(digest.Value), short(pin.Digest.Value)))
	case pin == nil && probed != nil && probed.Digest.Value != digest.Value:
		return fail(fmt.Errorf("%w: %s at %s changed after it was last checked (digest %s, checked %s). It is checked again before it is offered for work.",
			ErrArtifactMismatch, runtimeName, got.Path, short(digest.Value), short(probed.Digest.Value)))
	case pin == nil && probed == nil:
		return fail(fmt.Errorf("%w: %s has not been checked on this machine yet", ErrArtifactMismatch, runtimeName))
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return fail(err)
	}
	exeSum := digest.Value
	if got.Root != "" {
		exeSum = got.exeSum
	}
	return &VerifiedLaunch{File: f, Path: got.Path, Digest: digest, Env: got.Env, exeSum: exeSum, leased: leased, guardedAt: guardedAt}, nil
}

// Apply points cmd at the verified executable. On Linux it runs the open descriptor (passed as the
// child's first extra file) as /proc/self/fd/N; elsewhere it runs the verified path.
func (l *VerifiedLaunch) Apply(cmd *exec.Cmd) {
	target := l.Path
	if runtime.GOOS == "linux" && l.File != nil {
		cmd.ExtraFiles = append(cmd.ExtraFiles, l.File)
		target = fmt.Sprintf("/proc/self/fd/%d", 2+len(cmd.ExtraFiles))
	}
	cmd.Path, cmd.Args[0] = target, target
	cmd.Env = append(cmd.Env, l.Env...)
}

func short(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

// Ready is checked immediately before the start: the lease must still hold, with at most half the
// kernel's lease break time gone, so a writer that began waiting on the lease cannot be let through
// by its forced expiry before the exec makes the file unwritable. What remains is a launcher held
// stopped for the rest of that time by a process allowed to signal it: the hostile same-user case
// the threat model leaves to Phase 6.
func (l *VerifiedLaunch) Ready() error {
	if l == nil || !l.leased {
		return nil
	}
	if !leaseIntact(l.File) {
		return fmt.Errorf("%w: something opened the runtime for writing after it was checked", ErrArtifactMismatch)
	}
	if time.Since(l.guardedAt) > leaseBreakTime()/2 {
		return fmt.Errorf("%w: too long passed between checking the runtime and starting it; it is checked again on the next attempt", ErrArtifactMismatch)
	}
	return nil
}

// confirmWait bounds how long Confirm waits for the started process to execute the runtime.
var confirmWait = 10 * time.Second

// Confirm proves, once the run's process has started, that it executes the verified bytes. On
// Linux it waits until the process runs the descriptor's own file, then checks that the read lease
// taken before hashing still holds: no one has opened the file for writing since it was hashed
// (such an open blocks and breaks the lease), and from the exec on the kernel refuses writes. Only
// then is the lease released. Elsewhere it does nothing (the documented limit for launch by
// verified path).
func (l *VerifiedLaunch) Confirm(pid int) error {
	if l == nil || l.File == nil || runtime.GOOS != "linux" {
		return nil
	}
	info, err := l.File.Stat()
	if err != nil {
		return err
	}
	deadline := time.Now().Add(confirmWait)
	for {
		exe, err := os.Stat(fmt.Sprintf("/proc/%d/exe", pid))
		if err == nil && os.SameFile(exe, info) {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%w: the run's process was never seen executing the verified runtime", ErrArtifactMismatch)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if l.leased {
		if !leaseIntact(l.File) {
			return fmt.Errorf("%w: something opened the runtime for writing between its check and its start", ErrArtifactMismatch)
		}
		releaseLease(l.File)
		l.leased = false
	}
	return nil
}
