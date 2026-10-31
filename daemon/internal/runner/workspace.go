package runner

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
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

// Captured is a run's outputs read into the daemon's memory: their bytes, the files to send and
// their digests. Once captured, nothing the run writes afterwards can change them.
type Captured struct {
	Files []NamedFile
	Arts  []Artifact
	Raw   map[string][]byte
}

// Collect returns the regular files under dir, base64 encoded, with their SHA-256 artifacts.
// Symlinks and special files are refused. Each file and the total are capped.
func Collect(dir string, maxFile, maxTotal int64) ([]NamedFile, []Artifact, error) {
	c, err := Capture(dir, maxFile, maxTotal)
	if err != nil {
		return nil, nil, err
	}
	return c.Files, c.Arts, nil
}

// Capture reads the regular files under dir into memory, refusing symlinks and special files and
// enforcing the per file and total limits while it reads (a file that grows past them is refused,
// never read whole). A stop captures while the run is frozen, so the result is the outputs exactly
// as they stood when write authority ended (specification 22).
func Capture(dir string, maxFile, maxTotal int64) (*Captured, error) {
	var names []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) && p == dir {
				return fs.SkipAll
			}
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
		return nil, err
	}
	sort.Strings(names)
	var total int64
	c := &Captured{Files: make([]NamedFile, 0, len(names)), Arts: make([]Artifact, 0, len(names)), Raw: map[string][]byte{}}
	for _, n := range names {
		f, err := os.OpenFile(filepath.Join(dir, filepath.FromSlash(n)), os.O_RDONLY|syscallNoFollow, 0)
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(io.LimitReader(f, maxFile+1))
		f.Close()
		if err != nil {
			return nil, err
		}
		if int64(len(b)) > maxFile {
			return nil, fmt.Errorf("output %q is over the %d byte limit", n, maxFile)
		}
		total += int64(len(b))
		if total > maxTotal {
			return nil, fmt.Errorf("outputs exceed the %d byte total limit", maxTotal)
		}
		c.Raw[n] = b
		c.Files = append(c.Files, NamedFile{Name: n, ContentBase64: base64.StdEncoding.EncodeToString(b)})
		c.Arts = append(c.Arts, Artifact{Path: n, Digest: Digest{Algorithm: "sha256", Value: sha256Hex(b)}})
	}
	return c, nil
}
