package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func checkoutGit(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), hostGitVerifyTimeout)
	defer cancel()
	cmd, err := HostGitCommand(ctx, dir, args...)
	if err != nil {
		return "", err
	}
	b, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("read checkout Git identity: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}

// checkedCheckoutPath refuses links, including links in parent components, rather than
// resolving a different checkout. API selections already carry canonical absolute paths.
func checkedCheckoutPath(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return errors.New("checkout paths must be canonical and absolute")
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return fmt.Errorf("checkout path unavailable: %w", err)
	}
	if real != path {
		return errors.New("symbolic links are not permitted in checkout paths")
	}
	st, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !st.IsDir() {
		return errors.New("checkout path must be a directory")
	}
	return nil
}

func checkoutGitDirs(b *CheckoutBinding) error {
	entry := filepath.Join(b.Path, ".git")
	st, err := os.Lstat(entry)
	if err != nil {
		return err
	}
	gitDir := entry
	if st.Mode().IsRegular() {
		raw, err := os.ReadFile(entry)
		if err != nil {
			return err
		}
		target, ok := strings.CutPrefix(strings.TrimSpace(string(raw)), "gitdir: ")
		if !ok || strings.ContainsAny(target, "\r\n") {
			return errors.New("invalid checkout gitfile")
		}
		gitDir = target
		if !filepath.IsAbs(gitDir) {
			gitDir = filepath.Join(b.Path, gitDir)
		}
	} else if !st.IsDir() {
		return errors.New("checkout .git must be a directory or regular gitfile")
	}
	gitDir = filepath.Clean(gitDir)
	if gitDir != b.GitDir {
		return errors.New("checkout Git directory changed")
	}
	common := gitDir
	commonFile := filepath.Join(gitDir, "commondir")
	if st, err := os.Lstat(commonFile); err == nil {
		if !st.Mode().IsRegular() {
			return errors.New("checkout commondir must be a regular file")
		}
		raw, err := os.ReadFile(commonFile)
		if err != nil {
			return err
		}
		common = strings.TrimSpace(string(raw))
		if !filepath.IsAbs(common) {
			common = filepath.Join(gitDir, common)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if filepath.Clean(common) != b.CommonDir {
		return errors.New("checkout common Git directory changed")
	}
	return nil
}

func validateCheckout(b *CheckoutBinding) error {
	if b.Repo == "" || b.Branch == "" || b.Head == "" {
		return errors.New("incomplete checkout binding")
	}
	for _, path := range []string{b.Root, b.Path, b.GitDir, b.CommonDir} {
		if err := checkedCheckoutPath(path); err != nil {
			return err
		}
		if !within(path, b.Root) {
			return errors.New("checkout escapes its workspace root")
		}
	}
	if b.Path == b.Root {
		return errors.New("checkout cannot be the workspace root")
	}
	// Git administration must stay out of the agent-writable tree. A base or fresh clone keeps
	// .git inside the checkout, where hooks and config would be writable; only a linked worktree
	// keeps it outside.
	for _, admin := range []string{b.GitDir, b.CommonDir} {
		if within(admin, b.Path) {
			return errors.New("checkout Git administration is inside the checkout; only linked worktrees can be bound")
		}
	}
	if err := checkoutGitDirs(b); err != nil {
		return err
	}
	for _, check := range []struct {
		args []string
		want string
	}{
		{[]string{"rev-parse", "--show-toplevel"}, b.Path},
		{[]string{"rev-parse", "--absolute-git-dir"}, b.GitDir},
		{[]string{"rev-parse", "--path-format=absolute", "--git-common-dir"}, b.CommonDir},
		{[]string{"symbolic-ref", "--short", "HEAD"}, b.Branch},
		{[]string{"rev-parse", "--verify", "HEAD^{commit}"}, b.Head},
	} {
		got, err := checkoutGit(b.Path, check.args...)
		if err != nil {
			return err
		}
		if got != check.want {
			return errors.New("checkout identity, branch or HEAD changed; prepare the workspace again")
		}
	}
	return nil
}

func checkoutPrompt(ws *Workspace) string {
	return fmt.Sprintf("Read the Control Rod brief at %q and do exactly what it says. Your working directory is the selected repository checkout on branch %q. Edit project files here. Write deliverable files into %q, with every change to the repository in one patch named changes.patch at the top of that directory; write no other .patch or .diff file. References in the brief to inputs/ and out/ mean %q and %q. Do not alter the reserved .controlrod-run-* directories except this run's output directory. Exclude .controlrod-run-* directories from deliverable patches. Shared Git administration outside this checkout is not writable. Do not commit, stash or switch branches: leave your changes uncommitted, because Control Rod opens the pull request from the checked commit plus your patch.", filepath.Join(ws.Inputs, "BRIEF.md"), ws.Checkout.Branch, ws.Out, ws.Inputs, ws.Out)
}

// validateCheckoutHost is the daemon's own containment rule for a job-supplied binding. It does not
// trust the API: the workspace root and checkout must sit in the home folder outside any dot folder
// (the same rule the API applies to a workspace root), and neither may overlap the daemon's home,
// a CLI login location or a path the run's policy denies. Without this a checkout under ~/.ssh or
// ~/.controlrod would turn a denied folder into the writable workspace.
func validateCheckoutHost(b *CheckoutBinding, at SandboxPaths, p *SandboxPolicy) error {
	if at.Home == "" || !filepath.IsAbs(at.Home) {
		return errors.New("the home folder cannot be resolved, so a checkout cannot be placed in it")
	}
	home := filepath.Clean(at.Home)
	if real, err := filepath.EvalSymlinks(home); err == nil {
		home = real
	}
	for _, path := range []string{b.Root, b.Path} {
		rel, err := filepath.Rel(home, path)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
			return errors.New("checkout and workspace root must be inside the home folder")
		}
		if first := strings.Split(rel, string(filepath.Separator))[0]; strings.HasPrefix(first, ".") {
			return errors.New("checkout and workspace root cannot be inside a dot folder")
		}
	}
	// Paths that must not overlap the checkout or its root, in either direction.
	keep := append([]string{}, at.Logins...)
	if at.DaemonHome != "" {
		keep = append(keep, at.DaemonHome)
	}
	if p != nil {
		for _, d := range p.Denied(at) {
			if d != home && d != filepath.Clean(at.Home) { // the home folder itself holds every checkout
				keep = append(keep, d)
			}
		}
	}
	// Each protected path is compared as configured and as it really resolves: an alias (a linked
	// daemon home, say) whose target lies in the checkout would otherwise pass.
	for _, k := range keep {
		for _, cand := range []string{k, resolveOrClean(k)} {
			for _, path := range []string{b.Root, b.Path} {
				if within(path, cand) || within(cand, path) {
					return fmt.Errorf("checkout overlaps a protected location (%s)", k)
				}
			}
		}
	}
	return nil
}

// checkoutAfterRun reads the checkout's branch and HEAD once the run's processes are gone and
// reports them. It returns an error when the checkout is not what the job bound, other than by the
// author committing on the bound branch: the repository, Git directories, branch and .git entry must
// be unchanged, and HEAD must be the bound commit or a descendant of it. The observed values are
// returned with a branch or HEAD error, but never when the Git identity could not be confirmed.
func checkoutAfterRun(b *CheckoutBinding) (*CheckoutObserved, error) {
	// Identity first: branch and HEAD read from a repository that is not the bound one say nothing
	// about the bound one, so nothing is reported when it differs.
	for _, check := range []struct {
		args []string
		want string
	}{
		{[]string{"rev-parse", "--show-toplevel"}, b.Path},
		{[]string{"rev-parse", "--absolute-git-dir"}, b.GitDir},
		{[]string{"rev-parse", "--path-format=absolute", "--git-common-dir"}, b.CommonDir},
	} {
		got, gerr := checkoutGit(b.Path, check.args...)
		if gerr != nil || got != check.want {
			return nil, errors.New("checkout identity changed during the run")
		}
	}
	if err := checkoutGitDirs(b); err != nil {
		return nil, fmt.Errorf("checkout Git entry changed during the run: %w", err)
	}
	var obs CheckoutObserved
	var err error
	if obs.Branch, err = checkoutGit(b.Path, "symbolic-ref", "--short", "HEAD"); err != nil {
		return nil, fmt.Errorf("checkout branch could not be read after the run (detached HEAD?): %w", err)
	}
	if obs.Head, err = checkoutGit(b.Path, "rev-parse", "--verify", "HEAD^{commit}"); err != nil {
		return &obs, err
	}
	if obs.Branch != b.Branch {
		return &obs, fmt.Errorf("checkout branch changed during the run: bound %q, found %q", b.Branch, obs.Branch)
	}
	if obs.Head != b.Head {
		if _, err := checkoutGit(b.Path, "merge-base", "--is-ancestor", b.Head, obs.Head); err != nil {
			return &obs, fmt.Errorf("checkout HEAD %s is not the bound commit or a descendant of it", obs.Head)
		}
	}
	return &obs, nil
}

// resolveOrClean resolves links in p, or returns the cleaned path when it cannot (it does not exist).
func resolveOrClean(p string) string {
	if real, err := filepath.EvalSymlinks(p); err == nil {
		return real
	}
	return filepath.Clean(p)
}
