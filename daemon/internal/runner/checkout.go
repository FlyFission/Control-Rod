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
	return fmt.Sprintf("Read the Control Rod brief at %q and do exactly what it says. Your working directory is the selected repository checkout on branch %q. Edit project files here. Write deliverable files, including a patch of your changes, into %q. References in the brief to inputs/ and out/ mean %q and %q. Do not alter the reserved .controlrod-run-* directories except this run's output directory. Exclude .controlrod-run-* directories from deliverable patches. Shared Git administration outside this checkout is not writable.", filepath.Join(ws.Inputs, "BRIEF.md"), ws.Checkout.Branch, ws.Out, ws.Inputs, ws.Out)
}
