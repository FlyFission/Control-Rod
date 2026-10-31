package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// Artifact is one runtime executable as found on this machine: its resolved path and the SHA-256
// of the file there (specification 21). Runs launch this exact file, never whatever PATH finds.
type RuntimeArtifact struct {
	Path   string `json:"path"`
	Digest Digest `json:"digest"`
}

// RuntimePin names the artifact a run must launch, as the control plane's pin records it.
type RuntimePin struct {
	Runtime string `json:"runtime"`
	Digest  Digest `json:"digest"`
	Version string `json:"version,omitempty"`
}

// maxArtifactBytes bounds the file a probe will hash.
const maxArtifactBytes = 1 << 30

// resolveArtifact is how probes and launches find an executable; tests replace it.
var resolveArtifact = ResolveArtifact

// ResolveArtifact finds a runtime's executable on PATH, follows symlinks to the real file, and
// hashes it.
func ResolveArtifact(name string) (RuntimeArtifact, error) {
	p, err := exec.LookPath(name)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	abs, err := filepath.Abs(real)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	sum, err := fileDigest(abs)
	if err != nil {
		return RuntimeArtifact{}, err
	}
	return RuntimeArtifact{Path: abs, Digest: Digest{Algorithm: "sha256", Value: sum}}, nil
}

func fileDigest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, maxArtifactBytes+1))
	if err != nil {
		return "", err
	}
	if n > maxArtifactBytes {
		return "", errors.New("the executable is larger than Control Rod will hash")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ErrArtifactMismatch means the executable on disk is not the one the run may launch.
var ErrArtifactMismatch = errors.New("runtime artifact mismatch")

// VerifyLaunch checks, immediately before launch, that the runtime's executable is the expected
// artifact: the pinned one when a pin exists, otherwise the one the last probe reported. It
// returns the absolute path to execute. A mismatch fails closed with a sentence a person can act on.
func VerifyLaunch(runtime string, pin *RuntimePin, probed *RuntimeArtifact) (string, Digest, error) {
	got, err := resolveArtifact(runtime)
	if err != nil {
		return "", Digest{}, fmt.Errorf("%w: %s cannot be found or read: %v", ErrArtifactMismatch, runtime, err)
	}
	switch {
	case pin != nil && pin.Digest.Value != got.Digest.Value:
		return "", Digest{}, fmt.Errorf("%w: %s at %s is not the pinned version (digest %s, pinned %s). An administrator must pin the version installed now, or reinstall the pinned one.",
			ErrArtifactMismatch, runtime, got.Path, short(got.Digest.Value), short(pin.Digest.Value))
	case pin == nil && probed != nil && probed.Digest.Value != got.Digest.Value:
		return "", Digest{}, fmt.Errorf("%w: %s at %s changed after it was last checked (digest %s, checked %s). It is checked again before it is offered for work.",
			ErrArtifactMismatch, runtime, got.Path, short(got.Digest.Value), short(probed.Digest.Value))
	case pin == nil && probed == nil:
		return "", Digest{}, fmt.Errorf("%w: %s has not been checked on this machine yet", ErrArtifactMismatch, runtime)
	}
	return got.Path, got.Digest, nil
}

func short(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}
