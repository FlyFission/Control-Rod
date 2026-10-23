// Package confinement provides bounded file capabilities for a preparation broker.
// It has no native launcher and does not activate a runtime profile.
package confinement

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// MaxArtifactBytes is the existing controlled-source resource ceiling, not an
// engineering quantity. Each broker may choose a smaller positive budget.
const MaxArtifactBytes int64 = 5 * 1024 * 1024

var (
	ErrDenied      = errors.New("preparation capability refused")
	ErrUnsupported = errors.New("preparation file broker requires Linux")
)

// Scope is bound by the trusted supervisor, never selected by a tool request.
// These are internal capabilities, not serialized API or MCP contracts.
type Scope struct {
	GrantID, RunID, PackageID, PreparationID, BaseDigest, Role, Lane string
}
type Source struct{ Path, SHA256 string }
type Grant struct {
	Scope        Scope
	ExpiresAt    time.Time
	Revoked      bool
	Inputs       map[string]Source
	ProposalName string
}
type Event struct {
	Scope                                Scope
	Operation, InputID, Artifact, SHA256 string
	Bytes                                int64
}
type Receipt struct {
	SHA256 string
	Bytes  int64
}

// Authority holds its live grant/lease/revision/stop synchronization throughout
// the synchronous callback. record must append in the same transaction. A failed
// callback/commit must roll back its events. It must not reenter the broker.
// No permissive implementation is supplied: controller integration is required.
type Authority interface {
	WithCurrent(context.Context, string, func(Grant, func(Event) error) error) error
}
type Options struct {
	Scope                           Scope
	Authority                       Authority
	InputDir, OutputDir             string
	MaxInputBytes, MaxProposalBytes int64
	Now                             func() time.Time
}
type Broker struct {
	mu            sync.Mutex
	options       Options
	grant         Grant
	input, output *os.Root
	closed        bool
}

func validDigest(s string) bool {
	if len(s) != sha256.Size*2 || strings.ToLower(s) != s {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}
func validPath(s string) bool {
	return utf8.ValidString(s) && s != "." && fs.ValidPath(s) && !strings.ContainsAny(s, "\\\x00")
}
func validScope(s Scope) bool {
	for _, v := range []string{s.GrantID, s.RunID, s.PackageID, s.PreparationID} {
		if strings.TrimSpace(v) == "" || !utf8.ValidString(v) || strings.ContainsRune(v, 0) {
			return false
		}
	}
	return validDigest(s.BaseDigest) && (s.Role == "requirements-preparer" || s.Role == "technical-preparer") && (s.Lane == "public" || s.Lane == "internal")
}
func cloneGrant(g Grant) Grant { g.Inputs = maps.Clone(g.Inputs); return g }
func sameGrant(a, b Grant) bool {
	return a.Scope == b.Scope && a.ExpiresAt.Equal(b.ExpiresAt) && a.Revoked == b.Revoked && a.ProposalName == b.ProposalName && maps.Equal(a.Inputs, b.Inputs)
}
func (b *Broker) check(ctx context.Context, g Grant) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if g.Revoked || g.Scope != b.options.Scope || !b.options.Now().Before(g.ExpiresAt) {
		return ErrDenied
	}
	if !validPath(g.ProposalName) || strings.Contains(g.ProposalName, "/") {
		return ErrDenied
	}
	for id, s := range g.Inputs {
		if id == "" || !validPath(s.Path) || !validDigest(s.SHA256) {
			return ErrDenied
		}
	}
	return nil
}
func nested(a, b string) bool {
	rel, err := filepath.Rel(a, b)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func Open(ctx context.Context, options Options) (*Broker, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if runtime.GOOS != "linux" {
		return nil, ErrUnsupported
	}
	if options.Authority == nil || !validScope(options.Scope) || options.MaxInputBytes <= 0 || options.MaxInputBytes > MaxArtifactBytes || options.MaxProposalBytes <= 0 || options.MaxProposalBytes > MaxArtifactBytes {
		return nil, ErrDenied
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	inputPath, err := filepath.EvalSymlinks(options.InputDir)
	if err != nil {
		return nil, err
	}
	outputPath, err := filepath.EvalSymlinks(options.OutputDir)
	if err != nil {
		return nil, err
	}
	inputPath, err = filepath.Abs(inputPath)
	if err != nil {
		return nil, err
	}
	outputPath, err = filepath.Abs(outputPath)
	if err != nil {
		return nil, err
	}
	inInfo, err := os.Stat(inputPath)
	if err != nil {
		return nil, err
	}
	outInfo, err := os.Stat(outputPath)
	if err != nil {
		return nil, err
	}
	if !inInfo.IsDir() || !outInfo.IsDir() || os.SameFile(inInfo, outInfo) || nested(inputPath, outputPath) || nested(outputPath, inputPath) || outInfo.Mode().Perm()&0077 != 0 {
		return nil, ErrDenied
	}
	input, err := os.OpenRoot(inputPath)
	if err != nil {
		return nil, err
	}
	output, err := os.OpenRoot(outputPath)
	if err != nil {
		_ = input.Close()
		return nil, err
	}
	// Verify retained handles refer to the directories inspected above. A path
	// changed between inspection and OpenRoot must not bypass overlap/privacy checks.
	handlesMatch := func(root *os.Root, expected os.FileInfo) bool {
		f, e := root.Open(".")
		if e != nil {
			return false
		}
		defer f.Close()
		actual, e := f.Stat()
		return e == nil && os.SameFile(actual, expected) && actual.Mode().Perm() == expected.Mode().Perm()
	}
	if !handlesMatch(input, inInfo) || !handlesMatch(output, outInfo) {
		_ = input.Close()
		_ = output.Close()
		return nil, ErrDenied
	}
	b := &Broker{options: options, input: input, output: output}
	called := false
	err = options.Authority.WithCurrent(ctx, options.Scope.GrantID, func(g Grant, record func(Event) error) error {
		if called || record == nil {
			return ErrDenied
		}
		called = true
		if err := b.check(ctx, g); err != nil {
			return err
		}
		b.grant = cloneGrant(g)
		return nil
	})
	if err != nil || !called {
		_ = b.Close()
		if err == nil {
			err = ErrDenied
		}
		return nil, err
	}
	return b, nil
}

func (b *Broker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil
	}
	b.closed = true
	return errors.Join(b.input.Close(), b.output.Close())
}

func (b *Broker) use(ctx context.Context, fn func(Grant, func(Event) error) error) error {
	if b.closed {
		return ErrDenied
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	called := false
	err := b.options.Authority.WithCurrent(ctx, b.options.Scope.GrantID, func(g Grant, record func(Event) error) error {
		if called || record == nil {
			return ErrDenied
		}
		called = true
		if err := b.check(ctx, g); err != nil {
			return err
		}
		if !sameGrant(b.grant, g) {
			return ErrDenied
		}
		if err := fn(g, record); err != nil {
			return err
		}
		return b.check(ctx, g)
	})
	if err == nil && !called {
		return ErrDenied
	}
	return err
}

func (b *Broker) ReadInput(ctx context.Context, id string) ([]byte, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var data []byte
	err := b.use(ctx, func(g Grant, record func(Event) error) error {
		source, ok := g.Inputs[id]
		if !ok {
			return ErrDenied
		}
		f, err := openRegular(b.input, source.Path)
		if err != nil {
			return err
		}
		bytes, readErr := io.ReadAll(io.LimitReader(f, b.options.MaxInputBytes+1))
		closeErr := f.Close()
		if err := errors.Join(readErr, closeErr); err != nil {
			return err
		}
		sum := sha256.Sum256(bytes)
		observed := hex.EncodeToString(sum[:])
		if int64(len(bytes)) > b.options.MaxInputBytes || observed != source.SHA256 {
			return ErrDenied
		}
		if err := b.check(ctx, g); err != nil {
			return err
		}
		if err := record(Event{Scope: g.Scope, Operation: "read-input", InputID: id, Artifact: source.Path, SHA256: observed, Bytes: int64(len(bytes))}); err != nil {
			return err
		}
		data = bytes
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read input: %w", err)
	}
	return data, nil
}

// WriteProposal creates one fixed artifact. Only its successful receipt admits
// consumption; the dedicated directory is not an atomic-publication interface.
func (b *Broker) WriteProposal(ctx context.Context, data []byte) (Receipt, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if int64(len(data)) > b.options.MaxProposalBytes {
		return Receipt{}, ErrDenied
	}
	owned := append([]byte(nil), data...)
	var receipt Receipt
	created := ""
	err := b.use(ctx, func(g Grant, record func(Event) error) error {
		f, err := b.output.OpenFile(g.ProposalName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		created = g.ProposalName
		n, writeErr := f.Write(owned)
		if n != len(owned) && writeErr == nil {
			writeErr = io.ErrShortWrite
		}
		syncErr := f.Sync()
		closeErr := f.Close()
		if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
			return err
		}
		if err := b.check(ctx, g); err != nil {
			return err
		}
		sum := sha256.Sum256(owned)
		observed := hex.EncodeToString(sum[:])
		if err := record(Event{Scope: g.Scope, Operation: "write-proposal", Artifact: g.ProposalName, SHA256: observed, Bytes: int64(len(owned))}); err != nil {
			return err
		}
		receipt = Receipt{SHA256: observed, Bytes: int64(len(owned))}
		return nil
	})
	if err != nil {
		if created != "" {
			if cleanupErr := b.output.Remove(created); cleanupErr != nil {
				err = errors.Join(err, fmt.Errorf("remove refused proposal: %w", cleanupErr))
			}
		}
		return Receipt{}, fmt.Errorf("write proposal: %w", err)
	}
	return receipt, nil
}
