package binaryutil

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func writeExecutable(t *testing.T, path string, content []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestResolveBinaryValidateIdentityFallsThroughToRealBinary(t *testing.T) {
	root := t.TempDir()
	fakeDir := filepath.Join(root, "fake-bin")
	realDir := filepath.Join(root, "real-bin")
	fakeBin := filepath.Join(fakeDir, "codex")
	realBin := filepath.Join(realDir, "codex")

	writeExecutable(t, fakeBin, []byte("#!/bin/sh\necho 'colliding tool'\n"))
	writeExecutable(t, realBin, []byte("#!/bin/sh\necho 'real codex'\n"))

	var checked []string
	errWrongTool := errors.New("not the real tool")
	spec := BinarySpec{
		Label: "Codex",
		Names: []string{"codex"},
		ValidateIdentity: func(_ context.Context, path string) error {
			checked = append(checked, path)
			if path == fakeBin {
				return errWrongTool
			}
			return nil
		},
	}

	env := []string{"PATH=" + fakeDir + string(os.PathListSeparator) + realDir}
	got, err := ResolveBinary(context.Background(), spec, env)
	if err != nil {
		t.Fatalf("ResolveBinary failed: %v", err)
	}
	if got != realBin {
		t.Fatalf("ResolveBinary = %q, want %q", got, realBin)
	}
	if !slices.Equal(checked, []string{fakeBin, realBin}) {
		t.Fatalf("checked = %v, want [%s %s]", checked, fakeBin, realBin)
	}
}

func TestResolveBinaryDistinguishesNotFoundVsIdentityUnknown(t *testing.T) {
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	colliding := filepath.Join(binDir, "claude")
	writeExecutable(t, colliding, []byte("#!/bin/sh\nexit 0\n"))

	errBadIdentity := errors.New("bad identity")
	spec := BinarySpec{
		Label: "Claude Code",
		Names: []string{"claude"},
		ValidateIdentity: func(context.Context, string) error {
			return errBadIdentity
		},
	}

	// Candidate existed on PATH but failed ValidateIdentity -> ErrBinaryIdentityUnknown.
	_, err := ResolveBinary(context.Background(), spec, []string{"PATH=" + binDir})
	if !errors.Is(err, ErrBinaryIdentityUnknown) {
		t.Fatalf("expected ErrBinaryIdentityUnknown, got %v", err)
	}
	if !errors.Is(err, errBadIdentity) {
		t.Fatalf("expected wrapped identity error, got %v", err)
	}
	if errors.Is(err, ErrBinaryNotFound) {
		t.Fatalf("must not report ErrBinaryNotFound when candidate existed: %v", err)
	}

	// No candidate anywhere -> ErrBinaryNotFound.
	_, err = ResolveBinary(context.Background(), spec, []string{"PATH=" + filepath.Join(root, "empty")})
	if !errors.Is(err, ErrBinaryNotFound) {
		t.Fatalf("expected ErrBinaryNotFound, got %v", err)
	}
	if errors.Is(err, ErrBinaryIdentityUnknown) {
		t.Fatalf("must not report ErrBinaryIdentityUnknown when nothing exists: %v", err)
	}
}

func TestResolveBinarySearchesUnixHomePathsAfterPATH(t *testing.T) {
	home := t.TempDir()
	homeBin := filepath.Join(home, ".local", "bin", "agy")
	writeExecutable(t, homeBin, []byte("#!/bin/sh\nexit 0\n"))

	spec := BinarySpec{
		Label:         "Antigravity CLI",
		Names:         []string{"agy"},
		UnixHomePaths: []string{".local/bin/agy"},
	}

	got, err := ResolveBinary(context.Background(), spec, []string{
		"PATH=" + filepath.Join(home, "missing"),
		"HOME=" + home,
	})
	if err != nil {
		t.Fatalf("ResolveBinary failed: %v", err)
	}
	if got != homeBin {
		t.Fatalf("ResolveBinary = %q, want %q", got, homeBin)
	}
}

func TestIsNodeLaunchBinary(t *testing.T) {
	dir := t.TempDir()

	nodeEnv := filepath.Join(dir, "cli-env.js")
	writeExecutable(t, nodeEnv, []byte("#!/usr/bin/env node\nconsole.log('hi');\n"))

	nodeEnvFlags := filepath.Join(dir, "cli-env-s.js")
	writeExecutable(t, nodeEnvFlags, []byte("#!/usr/bin/env -S NODE_ENV=production node --no-warnings\n"))

	nodeDirect := filepath.Join(dir, "cli-direct.js")
	writeExecutable(t, nodeDirect, []byte("#!/usr/local/bin/node\n"))

	shScript := filepath.Join(dir, "cli.sh")
	writeExecutable(t, shScript, []byte("#!/bin/sh\necho not node\n"))

	elfBin := filepath.Join(dir, "cli-elf")
	writeExecutable(t, elfBin, []byte{0x7f, 'E', 'L', 'F', 2, 1, 1, 0})

	symlinkEnv := filepath.Join(dir, "cli-link")
	if err := os.Symlink(nodeEnv, symlinkEnv); err != nil {
		t.Fatal(err)
	}

	if !IsNodeLaunchBinary(nodeEnv) {
		t.Fatal("expected #!/usr/bin/env node to be detected")
	}
	if !IsNodeLaunchBinary(nodeEnvFlags) {
		t.Fatal("expected #!/usr/bin/env -S node to be detected")
	}
	if !IsNodeLaunchBinary(nodeDirect) {
		t.Fatal("expected #!/usr/local/bin/node to be detected")
	}
	if !IsNodeLaunchBinary(symlinkEnv) {
		t.Fatal("expected symlink to node script to be detected")
	}
	if IsNodeLaunchBinary(shScript) {
		t.Fatal("sh script must not be treated as a Node launch binary")
	}
	if IsNodeLaunchBinary(elfBin) {
		t.Fatal("ELF binary must not be treated as a Node launch binary")
	}
	if IsNodeLaunchBinary(filepath.Join(dir, "does-not-exist")) {
		t.Fatal("missing file must return false")
	}
}

func TestAugmentNodePATHWithSyntheticEnvNodeScript(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home")
	cliDir := filepath.Join(root, "tools", "bin")
	cliPath := filepath.Join(cliDir, "claude")
	writeExecutable(t, cliPath, []byte("#!/usr/bin/env node\nconsole.log('ok')\n"))

	// Place synthetic concrete node under NVM in isolated HOME (two versions to verify newest).
	nvmOld := filepath.Join(home, ".nvm", "versions", "node", "v18.19.0", "bin")
	nvmNew := filepath.Join(home, ".nvm", "versions", "node", "v22.11.0", "bin")
	writeExecutable(t, filepath.Join(nvmOld, "node"), []byte("#!/bin/sh\necho v18\n"))
	writeExecutable(t, filepath.Join(nvmNew, "node"), []byte("#!/bin/sh\necho v22\n"))

	basePATH := "/usr/bin:/bin"
	got := AugmentNodePATH(cliPath, basePATH, home)
	parts := filepath.SplitList(got)
	want := []string{cliDir, nvmNew, "/usr/bin", "/bin"}
	if !slices.Equal(parts, want) {
		t.Fatalf("AugmentNodePATH = %v, want %v", parts, want)
	}

	// Non-Node binary must leave PATH untouched.
	nativePath := filepath.Join(cliDir, "native-bin")
	writeExecutable(t, nativePath, []byte{0x7f, 'E', 'L', 'F', 2, 1, 1, 0})
	if unchanged := AugmentNodePATH(nativePath, basePATH, home); unchanged != basePATH {
		t.Fatalf("non-Node binary modified PATH: got %q, want %q", unchanged, basePATH)
	}
}

func TestAugmentNodePATHSupportsFnmAndVolta(t *testing.T) {
	for _, tc := range []struct {
		name    string
		nodeRel string
	}{
		{"fnm", ".local/share/fnm/aliases/default/bin/node"},
		{"volta", ".volta/bin/node"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			home := filepath.Join(root, "home")
			cliDir := filepath.Join(root, "cli")
			cliPath := filepath.Join(cliDir, "tool")
			writeExecutable(t, cliPath, []byte("#!/usr/bin/env node\n"))

			nodeBin := filepath.Join(home, tc.nodeRel)
			writeExecutable(t, nodeBin, []byte("#!/bin/sh\n"))

			got := AugmentNodePATH(cliPath, "/usr/bin", home)
			want := []string{cliDir, filepath.Dir(nodeBin), "/usr/bin"}
			if parts := filepath.SplitList(got); !slices.Equal(parts, want) {
				t.Fatalf("got %v, want %v", parts, want)
			}
		})
	}
}

type customWrappedErr struct {
	code int
	msg  string
}

func (e *customWrappedErr) Error() string { return e.msg }

func TestRedactValuesAndRedactError(t *testing.T) {
	// Longest-first avoids leaving a suffix/prefix behind when one secret is a substring of another.
	secrets := []string{"sk-secret", "sk-secret-full-token-999", ""}
	in := "auth failed with sk-secret-full-token-999 and sk-secret"
	redacted := RedactValues(in, secrets)
	if strings.Contains(redacted, "sk-secret") || strings.Contains(redacted, "999") {
		t.Fatalf("secret leaked in RedactValues: %q", redacted)
	}
	if got, want := redacted, "auth failed with "+RedactedPlaceholder+" and "+RedactedPlaceholder; got != want {
		t.Fatalf("RedactValues = %q, want %q", got, want)
	}

	sentinel := errors.New("upstream rejected")
	custom := &customWrappedErr{code: 401, msg: "token sk-secret-full-token-999 invalid"}
	baseErr := fmt.Errorf("%w: %w", sentinel, custom)

	wrapped := RedactError(baseErr, secrets)
	if wrapped == nil {
		t.Fatal("RedactError returned nil")
	}
	if strings.Contains(wrapped.Error(), "sk-secret") || strings.Contains(wrapped.Error(), "999") {
		t.Fatalf("secret leaked in RedactError.Error(): %q", wrapped.Error())
	}
	if !errors.Is(wrapped, sentinel) {
		t.Fatal("errors.Is failed through RedactError")
	}
	var gotCustom *customWrappedErr
	if !errors.As(wrapped, &gotCustom) || gotCustom.code != 401 {
		t.Fatalf("errors.As failed through RedactError: %v", gotCustom)
	}
	if RedactError(nil, secrets) != nil {
		t.Fatal("RedactError(nil) must return nil")
	}
}
