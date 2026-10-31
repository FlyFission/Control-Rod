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
	p, err := exec.LookPath(name)
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
			target, err := os.Readlink(p)
			if err != nil {
				return err
			}
			entries = append(entries, entry{rel, "link\x00" + rel + "\x00" + target})
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
	f, err := os.Open(got.Path)
	if err != nil {
		return nil, fmt.Errorf("%w: %s cannot be opened: %v", ErrArtifactMismatch, runtimeName, err)
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
	return &VerifiedLaunch{File: f, Path: got.Path, Digest: digest, Env: got.Env}, nil
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
