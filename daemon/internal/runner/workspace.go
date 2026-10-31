package runner

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Output limits: a run that exceeds them fails rather than truncating silently.
const (
	MaxOutputFile  = 20 << 20
	MaxOutputTotal = 100 << 20
)

var safeSegment = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// ErrUnsafePath reports an input name that would land outside inputs/.
var ErrUnsafePath = errors.New("unsafe input path")

// Workspace is one job's directory: inputs/ from the control plane, out/ for deliverables.
type Workspace struct {
	Dir    string
	Inputs string
	Out    string
}

// WorkspaceDir returns <root>/work/<package_id>/r<rev>/<role>-<round>-<runid>. Every segment
// that comes from the job must be a plain name, so a job cannot place a workspace elsewhere.
func WorkspaceDir(root string, run Run) (string, error) {
	for _, seg := range []string{run.PackageID, run.Role, run.ID} {
		if !safeSegment.MatchString(seg) {
			return "", fmt.Errorf("%w: %q", ErrUnsafePath, seg)
		}
	}
	if run.PackageRevision < 0 || run.Round < 0 {
		return "", fmt.Errorf("%w: negative revision or round", ErrUnsafePath)
	}
	leaf := fmt.Sprintf("%s-%d-%s", run.Role, run.Round, run.ID)
	return filepath.Join(root, "work", run.PackageID, fmt.Sprintf("r%d", run.PackageRevision), leaf), nil
}

// inputPath resolves an input name inside dir, refusing absolute paths, parent references and
// anything that cleans to a location outside dir.
func inputPath(dir, name string) (string, error) {
	if name == "" || filepath.IsAbs(name) || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
		return "", fmt.Errorf("%w: %q", ErrUnsafePath, name)
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." || part == "" || part == "." {
			return "", fmt.Errorf("%w: %q", ErrUnsafePath, name)
		}
	}
	p := filepath.Join(dir, filepath.FromSlash(name))
	rel, err := filepath.Rel(dir, p)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("%w: %q", ErrUnsafePath, name)
	}
	return p, nil
}

// Prepare creates the workspace and writes every input. It validates all names before writing
// anything.
func Prepare(root string, job *Job) (*Workspace, error) {
	dir, err := WorkspaceDir(root, job.Run)
	if err != nil {
		return nil, err
	}
	ws := &Workspace{Dir: dir, Inputs: filepath.Join(dir, "inputs"), Out: filepath.Join(dir, "out")}
	paths := make([]string, len(job.Inputs))
	data := make([][]byte, len(job.Inputs))
	for i, in := range job.Inputs {
		p, err := inputPath(ws.Inputs, in.Name)
		if err != nil {
			return nil, err
		}
		b, err := base64.StdEncoding.DecodeString(in.ContentBase64)
		if err != nil {
			return nil, fmt.Errorf("input %q: bad base64: %w", in.Name, err)
		}
		paths[i], data[i] = p, b
	}
	if err := os.RemoveAll(dir); err != nil {
		return nil, fmt.Errorf("clear workspace: %w", err)
	}
	for _, d := range []string{ws.Inputs, ws.Out} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, fmt.Errorf("create workspace: %w", err)
		}
	}
	for i, p := range paths {
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			return nil, fmt.Errorf("create input dir: %w", err)
		}
		if err := os.WriteFile(p, data[i], 0o600); err != nil {
			return nil, fmt.Errorf("write input: %w", err)
		}
	}
	return ws, nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Collect reads every regular file under dir in name order. It refuses symlinks and anything
// that is not a regular file, and enforces the per-file and total caps.
func Collect(dir string, maxFile, maxTotal int64) ([]NamedFile, []Artifact, error) {
	var names []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == dir {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		if d.Type()&fs.ModeSymlink != 0 {
			return fmt.Errorf("output %q is a symlink", rel)
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() {
			return fmt.Errorf("output %q is not a regular file", rel)
		}
		names = append(names, rel)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	sort.Strings(names)
	var total int64
	files := make([]NamedFile, 0, len(names))
	arts := make([]Artifact, 0, len(names))
	for _, n := range names {
		p := filepath.Join(dir, filepath.FromSlash(n))
		info, err := os.Lstat(p)
		if err != nil {
			return nil, nil, err
		}
		if info.Size() > maxFile {
			return nil, nil, fmt.Errorf("output %q is %d bytes, over the %d byte limit", n, info.Size(), maxFile)
		}
		total += info.Size()
		if total > maxTotal {
			return nil, nil, fmt.Errorf("outputs exceed the %d byte total limit", maxTotal)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, nil, err
		}
		files = append(files, NamedFile{Name: n, ContentBase64: base64.StdEncoding.EncodeToString(b)})
		arts = append(arts, Artifact{Path: n, Digest: Digest{Algorithm: "sha256", Value: sha256Hex(b)}})
	}
	return files, arts, nil
}

// Snapshot copies the files under src into dst (which must not exist), refusing symlinks. A stop
// takes it while the run is frozen, so it is the outputs exactly as they stood when write
// authority ended.
func Snapshot(src, dst string) error {
	if err := os.MkdirAll(dst, 0o700); err != nil {
		return err
	}
	return filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, os.ErrNotExist) && p == src {
				return nil
			}
			return err
		}
		rel, rerr := filepath.Rel(src, p)
		if rerr != nil || rel == "." {
			return rerr
		}
		target := filepath.Join(dst, rel)
		info, ierr := d.Info()
		if ierr != nil {
			return ierr
		}
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			return fmt.Errorf("%w: %s is a symlink", ErrUnsafePath, rel)
		case d.IsDir():
			return os.MkdirAll(target, 0o700)
		case info.Mode().IsRegular():
			b, rerr := os.ReadFile(p)
			if rerr != nil {
				return rerr
			}
			return os.WriteFile(target, b, 0o600)
		}
		return nil
	})
}
