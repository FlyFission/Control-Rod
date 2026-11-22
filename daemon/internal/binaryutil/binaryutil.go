// Package binaryutil resolves CLI executables, detects Node-shebang launchers
// for surgical PATH augmentation, and redacts secret values from strings and errors.
package binaryutil

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

// RedactedPlaceholder replaces secret values in redacted strings and errors.
const RedactedPlaceholder = "[REDACTED]"

const shebangReadLimit = 4096

var (
	// ErrBinaryNotFound indicates that no executable candidate was found.
	ErrBinaryNotFound = errors.New("binary not found")
	// ErrBinaryIdentityUnknown indicates that one or more executable candidates
	// were found, but none passed ValidateIdentity.
	ErrBinaryIdentityUnknown = errors.New("binary identity unknown")
)

// BinarySpec describes how to locate and optionally verify a runtime executable.
type BinarySpec struct {
	Label            string
	Names            []string
	UnixPaths        []string
	UnixHomePaths    []string
	NodeManaged      bool
	ValidateIdentity func(ctx context.Context, path string) error
}

// ResolveBinary searches PATH from env, then UnixPaths and UnixHomePaths.
// When ValidateIdentity is set, candidates that fail validation are skipped
// and ResolveBinary falls through to later candidates, returning
// ErrBinaryIdentityUnknown if executables existed but none passed validation,
// or ErrBinaryNotFound if no executable candidate existed at all.
func ResolveBinary(ctx context.Context, spec BinarySpec, env []string) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	pathVal, homeVal := lookupEnv(env, "PATH"), lookupEnv(env, "HOME")
	candidates := collectCandidates(spec, pathVal, homeVal)

	var (
		sawIdentityFailure bool
		lastIdentityErr    error
	)
	for _, cand := range candidates {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		if !isExecutableFile(cand) {
			continue
		}
		if spec.ValidateIdentity == nil {
			return cand, nil
		}
		err := spec.ValidateIdentity(ctx, cand)
		if err == nil {
			return cand, nil
		}
		sawIdentityFailure = true
		lastIdentityErr = err
	}

	label := specLabel(spec)
	if sawIdentityFailure {
		return "", fmt.Errorf("%w: %s: %w", ErrBinaryIdentityUnknown, label, lastIdentityErr)
	}
	return "", fmt.Errorf("%w: %s", ErrBinaryNotFound, label)
}

func specLabel(spec BinarySpec) string {
	if spec.Label != "" {
		return spec.Label
	}
	for _, n := range spec.Names {
		if n != "" {
			return n
		}
	}
	return "binary"
}

func lookupEnv(env []string, key string) string {
	val := ""
	prefix := key + "="
	for _, kv := range env {
		if v, ok := strings.CutPrefix(kv, prefix); ok {
			val = v
		}
	}
	return val
}

func collectCandidates(spec BinarySpec, pathVal, homeVal string) []string {
	seen := make(map[string]bool)
	var out []string
	add := func(p string) {
		if p == "" {
			return
		}
		clean := filepath.Clean(p)
		if !seen[clean] {
			seen[clean] = true
			out = append(out, clean)
		}
	}
	addEntry := func(entry string) {
		if entry == "" {
			return
		}
		if fi, err := os.Stat(entry); err == nil && fi.IsDir() {
			for _, name := range spec.Names {
				if name != "" {
					add(filepath.Join(entry, name))
				}
			}
			return
		}
		add(entry)
	}

	for _, dir := range filepath.SplitList(pathVal) {
		if dir == "" {
			continue
		}
		for _, name := range spec.Names {
			if name != "" {
				add(filepath.Join(dir, name))
			}
		}
	}
	for _, p := range spec.UnixPaths {
		addEntry(p)
	}
	if homeVal != "" {
		for _, hp := range spec.UnixHomePaths {
			if hp == "" {
				continue
			}
			hp = strings.TrimPrefix(hp, "~/")
			if filepath.IsAbs(hp) {
				addEntry(hp)
			} else {
				addEntry(filepath.Join(homeVal, hp))
			}
		}
	}
	return out
}

func isExecutableFile(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && !fi.IsDir() && fi.Mode().Perm()&0o111 != 0
}

// IsNodeLaunchBinary reads up to 4KB from path and reports whether its #!
// shebang invokes Node directly or via env.
func IsNodeLaunchBinary(path string) bool {
	if path == "" {
		return false
	}
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, shebangReadLimit)
	n, err := io.ReadFull(f, buf)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return false
	}
	head := buf[:n]
	if len(head) < 2 || head[0] != '#' || head[1] != '!' {
		return false
	}
	lineBytes := head[2:]
	if idx := bytes.IndexByte(lineBytes, '\n'); idx >= 0 {
		lineBytes = lineBytes[:idx]
	}
	line := strings.TrimSpace(strings.TrimSuffix(string(lineBytes), "\r"))
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return false
	}

	interp := filepath.Base(fields[0])
	if isNodeExecutableName(interp) {
		return true
	}
	if interp != "env" {
		return false
	}

	endOfFlags := false
	for _, tok := range fields[1:] {
		if !endOfFlags {
			if tok == "--" {
				endOfFlags = true
				continue
			}
			if strings.HasPrefix(tok, "-") {
				continue
			}
		}
		if strings.Contains(tok, "=") && !strings.HasPrefix(tok, "/") {
			continue
		}
		return isNodeExecutableName(filepath.Base(tok))
	}
	return false
}

func isNodeExecutableName(name string) bool {
	return name == "node" || name == "nodejs"
}

// AugmentNodePATH surgically updates currentPATH when binaryPath is a
// Node-shebang launcher, locating a concrete node executable in currentPATH,
// NVM, fnm, Volta, or Homebrew and prepending only the binary directory and
// the located Node directory. Non-Node binaries return currentPATH unchanged.
func AugmentNodePATH(binaryPath string, currentPATH string, home string) string {
	if !IsNodeLaunchBinary(binaryPath) {
		return currentPATH
	}
	var prepend []string
	if binDir := filepath.Dir(binaryPath); binDir != "" && binDir != "." {
		prepend = append(prepend, filepath.Clean(binDir))
	}
	if nodePath := findNodeExecutable(currentPATH, home); nodePath != "" {
		nodeDir := filepath.Clean(filepath.Dir(nodePath))
		if !slices.Contains(prepend, nodeDir) {
			prepend = append(prepend, nodeDir)
		}
	}
	if len(prepend) == 0 {
		return currentPATH
	}

	seen := make(map[string]bool, len(prepend))
	out := make([]string, 0, len(prepend)+4)
	for _, d := range prepend {
		if d != "" && !seen[d] {
			seen[d] = true
			out = append(out, d)
		}
	}
	for _, d := range filepath.SplitList(currentPATH) {
		if d == "" {
			continue
		}
		clean := filepath.Clean(d)
		if !seen[clean] {
			seen[clean] = true
			out = append(out, d)
		}
	}
	return strings.Join(out, string(os.PathListSeparator))
}

func findNodeExecutable(currentPATH, home string) string {
	for _, dir := range filepath.SplitList(currentPATH) {
		if dir == "" {
			continue
		}
		cand := filepath.Join(dir, "node")
		if isExecutableFile(cand) {
			return cand
		}
	}
	if home != "" {
		homeCandidates := []string{
			filepath.Join(home, ".nvm", "current", "bin", "node"),
		}
		for _, c := range homeCandidates {
			if isExecutableFile(c) {
				return c
			}
		}
		if p := newestGlobExecutable(filepath.Join(home, ".nvm", "versions", "node", "*", "bin", "node")); p != "" {
			return p
		}
		fnmAliases := []string{
			filepath.Join(home, ".local", "share", "fnm", "aliases", "default", "bin", "node"),
			filepath.Join(home, ".fnm", "aliases", "default", "bin", "node"),
			filepath.Join(home, "Library", "Application Support", "fnm", "aliases", "default", "bin", "node"),
		}
		for _, c := range fnmAliases {
			if isExecutableFile(c) {
				return c
			}
		}
		for _, pat := range []string{
			filepath.Join(home, ".local", "share", "fnm", "node-versions", "*", "installation", "bin", "node"),
			filepath.Join(home, ".fnm", "node-versions", "*", "installation", "bin", "node"),
			filepath.Join(home, "Library", "Application Support", "fnm", "node-versions", "*", "installation", "bin", "node"),
		} {
			if p := newestGlobExecutable(pat); p != "" {
				return p
			}
		}
		if c := filepath.Join(home, ".volta", "bin", "node"); isExecutableFile(c) {
			return c
		}
		if p := newestGlobExecutable(filepath.Join(home, ".volta", "tools", "image", "node", "*", "bin", "node")); p != "" {
			return p
		}
	}
	for _, sysPath := range []string{
		"/opt/homebrew/bin/node",
		"/opt/homebrew/opt/node/bin/node",
		"/usr/local/bin/node",
		"/home/linuxbrew/.linuxbrew/bin/node",
		"/usr/bin/node",
	} {
		if isExecutableFile(sysPath) {
			return sysPath
		}
	}
	return ""
}

func newestGlobExecutable(pattern string) string {
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return ""
	}
	slices.SortFunc(matches, func(a, b string) int {
		return compareVersionDesc(a, b)
	})
	for _, m := range matches {
		if isExecutableFile(m) {
			return m
		}
	}
	return ""
}

func compareVersionDesc(a, b string) int {
	va, vb := extractSemver(a), extractSemver(b)
	for i := range 3 {
		if va[i] != vb[i] {
			if va[i] > vb[i] {
				return -1
			}
			return 1
		}
	}
	return strings.Compare(b, a)
}

func extractSemver(p string) [3]int {
	var out [3]int
	for _, seg := range strings.Split(filepath.ToSlash(p), "/") {
		s := strings.TrimPrefix(seg, "v")
		parts := strings.Split(s, ".")
		if len(parts) < 2 {
			continue
		}
		major, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		minor, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		patch := 0
		if len(parts) >= 3 {
			if pv, perr := strconv.Atoi(parts[2]); perr == nil {
				patch = pv
			}
		}
		return [3]int{major, minor, patch}
	}
	return out
}

// RedactValues replaces every non-empty secret in s with RedactedPlaceholder,
// matching longest secrets first so substrings do not leave partial leaks.
func RedactValues(s string, secrets []string) string {
	cleaned := normalizeSecrets(secrets)
	if s == "" || len(cleaned) == 0 {
		return s
	}
	for _, sec := range cleaned {
		s = strings.ReplaceAll(s, sec, RedactedPlaceholder)
	}
	return s
}

type redactedError struct {
	err     error
	secrets []string
}

func (e *redactedError) Error() string {
	return RedactValues(e.err.Error(), e.secrets)
}

func (e *redactedError) Unwrap() error {
	return e.err
}

// RedactError wraps err so its Error() text redacts secrets longest-first while
// preserving errors.Is and errors.As matching against the underlying error.
func RedactError(err error, secrets []string) error {
	if err == nil {
		return nil
	}
	cleaned := normalizeSecrets(secrets)
	if len(cleaned) == 0 {
		return err
	}
	return &redactedError{err: err, secrets: cleaned}
}

func normalizeSecrets(secrets []string) []string {
	if len(secrets) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(secrets))
	out := make([]string, 0, len(secrets))
	for _, sec := range secrets {
		if sec == "" || sec == RedactedPlaceholder || seen[sec] {
			continue
		}
		seen[sec] = true
		out = append(out, sec)
	}
	slices.SortFunc(out, func(a, b string) int {
		if len(a) != len(b) {
			if len(a) > len(b) {
				return -1
			}
			return 1
		}
		return strings.Compare(a, b)
	})
	return out
}
