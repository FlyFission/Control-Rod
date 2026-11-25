package runner

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
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
// A checker workspace (Checker set) is different: Dir is a clean working directory, Deliverables
// is the tree mounted read-only at inputs/deliverables, and Scratch is the only directory the
// checker may write.
type Workspace struct {
	Dir    string
	Inputs string
	Out    string
	// releaseCheckout holds exclusive host-side custody until output collection ends.
	releaseCheckout func()
	// checkoutRoot is the one handle on the validated checkout, opened once and checked against the
	// directory that was validated. Reservation, staging and capture all go through it, never
	// through the checkout's path again.
	checkoutRoot *os.Root
	// runRoot is the handle on the run directory this daemon created. Staging and capture go
	// through it, so a link placed where the directory should be is never followed.
	runRoot  *os.Root
	Checkout *CheckoutBinding
	// HookFile, when set, is where a Claude Code PermissionRequest hook appends what it saw
	// (interim waiting detection, plan task 2.9). It lives outside the workspace.
	HookFile string
	// Checker selects the pre-check workspace and the checker launch flags.
	Checker bool
	// Deliverables is the host path of the deliverable tree. It is not the working directory.
	Deliverables string
	// Scratch is the checker's write directory, inside Dir.
	Scratch string
	// VerifiedPath is the host path of the verified executable. The checker mount
	// uses this path instead of reading /proc/self/fd, which can report " (deleted)".
	VerifiedPath string
	// CheckerRuntime is claude or codex for a sandboxed pre-check. Only that
	// CLI's login directory is given any write.
	CheckerRuntime string
	// LoginRoot is that directory even when it does not exist yet. LoginDigest is
	// the hash of its instruction and settings paths, taken before the process
	// starts. An absent directory is part of the hash, so creating it voids the check.
	LoginRoot   string
	LoginDigest string
	// LoginDisposable is this run's directory mounted over session paths on Linux.
	// It is not the real login directory, and the daemon removes only this directory.
	LoginDisposable string
	// RunHome is a per-run home folder a runtime starts with (HOME), outside the workspace and
	// so not writable by its agent. The daemon removes it after the run.
	RunHome string
	// RunRoot is a per-run folder a runtime's workspace was made in (workspaceRooter). It holds
	// only this run's workspace and run home, and the daemon removes it after the run.
	RunRoot string
	// CheckerTmp is the macOS per-run temporary directory. The daemon removes it
	// after the run. Linux uses the private /tmp tmpfs and does not set this.
	CheckerTmp string
	// Seccomp is the Unix-socket filter passed to bubblewrap. The daemon closes
	// it after the run. It is nil when the platform has no seccomp filter.
	Seccomp *os.File
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
	if job.Run.Checkout != nil {
		if job.Run.Role != "author" {
			return nil, errors.New("only an author run may carry a checkout binding")
		}
		if err := validateCheckout(job.Run.Checkout); err != nil {
			return nil, err
		}
		lockPath, err := checkoutLockPath(root, job.Run.Checkout)
		if err != nil {
			return nil, err
		}
		release, err := lockCheckout(lockPath)
		if err != nil {
			return nil, fmt.Errorf("checkout is unavailable or already in use: %w", err)
		}
		// Open the checkout once. Everything after this goes through the handle, so a path component
		// swapped for a link later cannot reach another directory. The handle is then compared with
		// the directory the path names after validation: an ancestor swapped in between differs.
		cr, err := openValidatedCheckout(job.Run.Checkout)
		if err != nil {
			release()
			return nil, err
		}
		// No directory in the selected checkout is cleared, reused or followed.
		dir = filepath.Join(job.Run.Checkout.Path, ".controlrod-run-"+job.Run.ID)
		name := filepath.Base(dir)
		rr, err := reserveRunDir(cr, name)
		if err != nil {
			cr.Close()
			release()
			return nil, fmt.Errorf("reserve checkout run directory: %w", err)
		}
		// The run directory is this run's own; it is removed with the custody so it is not left in
		// the user's checkout. Removal goes through the handle and never follows a link.
		unlock := release
		release = func() {
			// Only the directory this run reserved is removed. If the name now holds anything else
			// (the author renamed ours and moved a real directory into its place), leave it alone.
			if opened, err := rr.Stat("."); err == nil {
				if named, lerr := cr.Lstat(name); lerr == nil && os.SameFile(opened, named) {
					_ = removeAllIn(cr, name)
				} else if lerr == nil {
					slog.Warn("run directory was replaced during the run; left in place", "path", filepath.Join(job.Run.Checkout.Path, name))
				}
			}
			rr.Close()
			cr.Close()
			unlock()
		}
		ws = &Workspace{Dir: job.Run.Checkout.Path, Inputs: filepath.Join(dir, "inputs"), Out: filepath.Join(dir, "out"), Checkout: job.Run.Checkout, releaseCheckout: release, checkoutRoot: cr, runRoot: rr}
		for i, in := range job.Inputs {
			paths[i], _ = inputPath(ws.Inputs, in.Name) // already validated above
		}
	} else {
		if err := os.RemoveAll(dir); err != nil {
			return nil, fmt.Errorf("clear workspace: %w", err)
		}
	}
	prepared := false
	defer func() {
		if !prepared && ws.releaseCheckout != nil {
			ws.releaseCheckout()
		}
	}()
	if ws.Checkout != nil {
		// Through a directory handle on the checkout, so a path component swapped for a link
		// cannot send a write outside it.
		if err := stageCheckoutInputs(ws.runRoot, job.Inputs, data); err != nil {
			return nil, err
		}
		prepared = true
		return ws, nil
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
	prepared = true
	return ws, nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// beforeStartCheck is the last look at a bound checkout before its process starts: identity, branch
// and HEAD must still be what the job named. Anything else (a commit, a checkout, a moved Git
// directory since preparation) refuses the start.
func (ws *Workspace) beforeStartCheck() error {
	if ws.Checkout == nil {
		return nil
	}
	if err := validateCheckout(ws.Checkout); err != nil {
		return err
	}
	// The process starts in the checkout by pathname; this narrows, but cannot close, the window in
	// which a directory swapped in after preparation could be entered (see risk.md).
	return ws.checkoutStillSame()
}

// checkoutLockPath is the custody lock for one checkout. It lives in the daemon's own home, which no
// agent can write, and is keyed by the checkout's identity, so neither unlinking files in the
// checkout nor its Git administration releases custody.
func checkoutLockPath(root string, b *CheckoutBinding) (string, error) {
	dir := filepath.Join(root, "checkout-locks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create checkout lock directory: %w", err)
	}
	if st, err := os.Lstat(dir); err != nil || !st.IsDir() {
		return "", errors.New("checkout lock directory must be a real directory")
	}
	return filepath.Join(dir, sha256Hex([]byte(b.Path + "\x00" + b.GitDir + "\x00" + b.CommonDir))[:32]+".lock"), nil
}

// ErrLinkedRunPath reports a run directory reached through a symbolic link.
var ErrLinkedRunPath = errors.New("a run directory path contains a symbolic link")

// CaptureRun is Capture for a run workspace. For a checkout run the directory is opened through
// handles on each component below the checkout, so a link in any of them is refused and a swap after
// the open cannot redirect a read.
func (ws *Workspace) CaptureRun(dir string, maxFile, maxTotal int64) (*Captured, error) {
	if ws.Checkout == nil {
		return Capture(dir, maxFile, maxTotal)
	}
	r, err := openRunDir(ws.runRoot, filepath.Dir(ws.Out), dir)
	if err != nil {
		return nil, err
	}
	if r == nil {
		return newCaptured(), nil
	}
	defer r.Close()
	return captureRoot(r, maxFile, maxTotal)
}

// testHookAfterCheckoutValidated lets a test change the file system between validation and the
// identity check of the opened handle.
var testHookAfterCheckoutValidated func()

// openValidatedCheckout opens the checkout's directory handle, validates the binding, and requires
// the handle's directory to be the one the path names now (same device and inode).
func openValidatedCheckout(b *CheckoutBinding) (*os.Root, error) {
	cr, err := os.OpenRoot(b.Path)
	if err != nil {
		return nil, fmt.Errorf("open checkout: %w", err)
	}
	if err := validateCheckout(b); err != nil {
		cr.Close()
		return nil, err
	}
	if testHookAfterCheckoutValidated != nil {
		testHookAfterCheckoutValidated()
	}
	opened, err := cr.Stat(".")
	if err != nil {
		cr.Close()
		return nil, err
	}
	named, err := os.Lstat(b.Path)
	if err != nil || !os.SameFile(opened, named) {
		cr.Close()
		return nil, errors.New("the checkout directory changed while it was opened; prepare the workspace again")
	}
	return cr, nil
}

// testHookAfterRunDirCreated lets a test replace the run directory between its creation and open.
var testHookAfterRunDirCreated func()

// reserveRunDir creates the run directory (failing if the name exists) and opens it, then requires
// the opened directory to be the very one created: a link swapped in at that name opens some other
// directory in the checkout, which has a different identity from the link's own Lstat.
func reserveRunDir(cr *os.Root, name string) (*os.Root, error) {
	if err := cr.Mkdir(name, 0o700); err != nil {
		return nil, err
	}
	if testHookAfterRunDirCreated != nil {
		testHookAfterRunDirCreated()
	}
	rr, err := cr.OpenRoot(name)
	if err != nil {
		return nil, err
	}
	opened, err := rr.Stat(".")
	named, lerr := cr.Lstat(name)
	if err != nil || lerr != nil || !named.IsDir() || !os.SameFile(opened, named) {
		rr.Close()
		return nil, errors.New("the run directory was replaced while it was reserved")
	}
	return rr, nil
}

// checkoutStillSame reports whether the path still names the directory the held handle opened.
func (ws *Workspace) checkoutStillSame() error {
	if ws.checkoutRoot == nil {
		return nil
	}
	opened, err := ws.checkoutRoot.Stat(".")
	named, lerr := os.Lstat(ws.Checkout.Path)
	if err != nil || lerr != nil || !os.SameFile(opened, named) {
		return errors.New("the checkout path no longer names the directory that was prepared")
	}
	return nil
}

// removeAllIn removes name and everything under it through the handle r, never following a link.
func removeAllIn(r *os.Root, name string) error {
	st, err := r.Lstat(name)
	if err != nil {
		return err
	}
	if st.IsDir() {
		sub, err := r.OpenRoot(name)
		if err != nil {
			return err
		}
		d, err := sub.Open(".")
		if err == nil {
			names, _ := d.Readdirnames(-1)
			d.Close()
			for _, n := range names {
				_ = removeAllIn(sub, n)
			}
		}
		sub.Close()
	}
	return r.Remove(name)
}

// stageCheckoutInputs creates inputs/ and out/ in the run directory and writes every input, all
// through directory handles (os.Root): an intermediate directory swapped for a link cannot make the
// daemon create or truncate a file outside the run directory. Files are created exclusively.
func stageCheckoutInputs(rr *os.Root, inputs []NamedFile, data [][]byte) error {
	mkdir := func(rel string) error {
		if err := rr.Mkdir(rel, 0o700); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}
		if st, err := rr.Lstat(rel); err != nil || !st.IsDir() {
			return fmt.Errorf("%q is not a directory", rel)
		}
		return nil
	}
	for _, d := range []string{"inputs", "out"} {
		if err := mkdir(d); err != nil {
			return fmt.Errorf("create workspace: %w", err)
		}
	}
	for i, in := range inputs {
		parts := strings.Split(in.Name, "/") // validated by inputPath: no empty, dot or dot-dot parts
		for j := 1; j < len(parts); j++ {
			if err := mkdir("inputs/" + strings.Join(parts[:j], "/")); err != nil {
				return fmt.Errorf("create input dir: %w", err)
			}
		}
		f, err := rr.OpenFile("inputs/"+in.Name, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscallNoFollow, 0o600)
		if err != nil {
			return fmt.Errorf("write input: %w", err)
		}
		_, werr := f.Write(data[i])
		if cerr := f.Close(); werr == nil {
			werr = cerr
		}
		if werr != nil {
			return fmt.Errorf("write input: %w", werr)
		}
	}
	return nil
}

// openRunDir opens dir, which must be inside checkout, as a directory handle, checking every
// component below the checkout with Lstat through the handle of its parent and refusing a link.
// The returned handle stays on the directory it opened even if a path is swapped afterwards. A
// missing directory returns (nil, nil).
func openRunDir(base *os.Root, checkout, dir string) (*os.Root, error) {
	rel, err := filepath.Rel(checkout, filepath.Clean(dir))
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
		return nil, fmt.Errorf("%w: %s is not inside the checkout", ErrLinkedRunPath, dir)
	}
	cur, parts := base, strings.Split(rel, string(filepath.Separator))
	for i, part := range parts {
		st, err := cur.Lstat(part)
		if err != nil {
			if i > 0 {
				cur.Close()
			}
			if errors.Is(err, fs.ErrNotExist) {
				return nil, nil
			}
			return nil, err
		}
		if st.Mode()&fs.ModeSymlink != 0 || !st.IsDir() {
			if i > 0 {
				cur.Close()
			}
			return nil, fmt.Errorf("%w: %s", ErrLinkedRunPath, part)
		}
		next, err := cur.OpenRoot(part)
		if i > 0 {
			cur.Close() // the checkout handle belongs to the workspace
		}
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrLinkedRunPath, err)
		}
		cur = next
	}
	return cur, nil
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
	dir = filepath.Clean(dir)
	st, err := os.Lstat(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return newCaptured(), nil
	}
	if err != nil {
		return nil, err
	}
	if st.Mode()&fs.ModeSymlink != 0 {
		return nil, fmt.Errorf("output root %q is a symlink", dir)
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("output root %q is not a directory", dir)
	}
	r, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return captureRoot(r, maxFile, maxTotal)
}

func newCaptured() *Captured {
	return &Captured{Files: []NamedFile{}, Arts: []Artifact{}, Raw: map[string][]byte{}}
}

// captureRoot walks and reads through the directory handle r: every open is resolved relative to the
// handle, so a parent swapped for a link after the walk cannot make it read outside r.
func captureRoot(r *os.Root, maxFile, maxTotal int64) (*Captured, error) {
	var names []string
	err := fs.WalkDir(r.FS(), ".", func(rel string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
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
	c := newCaptured()
	for _, n := range names {
		f, err := r.OpenFile(n, os.O_RDONLY|syscallNoFollow, 0)
		if err != nil {
			return nil, err
		}
		if st, serr := f.Stat(); serr != nil || !st.Mode().IsRegular() {
			f.Close()
			return nil, fmt.Errorf("output %q is not a regular file", n)
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
