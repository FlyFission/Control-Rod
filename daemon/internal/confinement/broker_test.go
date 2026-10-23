//go:build linux

package confinement

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

type testAuthority struct {
	skip, twice, nilRecorder   bool
	mu                         sync.Mutex
	grant                      Grant
	events                     []Event
	deny, recordErr, commitErr error
	change                     func()
}

func (a *testAuthority) WithCurrent(ctx context.Context, id string, fn func(Grant, func(Event) error) error) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.deny != nil {
		return a.deny
	}
	if a.skip {
		return nil
	}
	if a.nilRecorder {
		return fn(a.grant, nil)
	}
	var pending []Event
	if err := fn(a.grant, func(e Event) error {
		if a.change != nil {
			a.change()
		}
		if a.recordErr != nil {
			return a.recordErr
		}
		pending = append(pending, e)
		return nil
	}); err != nil {
		return err
	}
	if a.twice {
		if err := fn(a.grant, func(Event) error { return nil }); err != nil {
			return err
		}
	}
	if a.commitErr != nil {
		return a.commitErr
	}
	a.events = append(a.events, pending...)
	return nil
}
func hash(data []byte) string { s := sha256.Sum256(data); return hex.EncodeToString(s[:]) }

type fixture struct {
	b       *Broker
	a       *testAuthority
	in, out string
	now     time.Time
	options Options
}

func setup(t *testing.T) *fixture {
	t.Helper()
	root := t.TempDir()
	in, out := filepath.Join(root, "in"), filepath.Join(root, "out")
	for _, p := range []string{in, out} {
		if err := os.Mkdir(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	data := []byte("controlled source")
	if err := os.WriteFile(filepath.Join(in, "source.md"), data, 0600); err != nil {
		t.Fatal(err)
	}
	f := &fixture{in: in, out: out, now: time.Now()}
	scope := Scope{GrantID: "G-1", RunID: "RUN-1", PackageID: "WP-1", PreparationID: "P-1", BaseDigest: hash([]byte("basis")), Role: "requirements-preparer", Lane: "internal"}
	f.a = &testAuthority{grant: Grant{Scope: scope, ExpiresAt: f.now.Add(time.Minute), Inputs: map[string]Source{"source": {Path: "source.md", SHA256: hash(data)}}, ProposalName: "proposal.json"}}
	f.options = Options{Scope: scope, Authority: f.a, InputDir: in, OutputDir: out, MaxInputBytes: 64, MaxProposalBytes: 64, Now: func() time.Time { return f.now }}
	var err error
	f.b, err = Open(context.Background(), f.options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := f.b.Close(); err != nil {
			t.Error(err)
		}
	})
	return f
}
func TestAssignedReadHasExactBytesAndCustody(t *testing.T) {
	f := setup(t)
	data, err := f.b.ReadInput(context.Background(), "source")
	if err != nil || string(data) != "controlled source" {
		t.Fatalf("read=%q error=%v", data, err)
	}
	if len(f.a.events) != 1 {
		t.Fatalf("events=%v", f.a.events)
	}
	e := f.a.events[0]
	if e.Operation != "read-input" || e.InputID != "source" || e.SHA256 != hash(data) || e.Bytes != int64(len(data)) || e.Scope != f.options.Scope {
		t.Fatalf("event=%+v", e)
	}
}
func TestUnassignedOrChangedInputReturnsNoBytes(t *testing.T) {
	for _, name := range []string{"unknown", "changed", "oversized", "missing"} {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			id := "source"
			switch name {
			case "unknown":
				id = "/etc/passwd"
			case "changed":
				_ = os.WriteFile(filepath.Join(f.in, "source.md"), []byte("changed"), 0600)
			case "oversized":
				_ = os.WriteFile(filepath.Join(f.in, "source.md"), make([]byte, 65), 0600)
			case "missing":
				_ = os.Remove(filepath.Join(f.in, "source.md"))
			}
			data, err := f.b.ReadInput(context.Background(), id)
			if err == nil || len(data) != 0 || len(f.a.events) != 0 {
				t.Fatalf("data=%q error=%v events=%v", data, err, f.a.events)
			}
		})
	}
}
func TestGrantDriftAndAuthorityFailuresHoldRead(t *testing.T) {
	changes := map[string]func(*fixture){
		"revoked":           func(f *fixture) { f.a.grant.Revoked = true },
		"expired":           func(f *fixture) { f.now = f.a.grant.ExpiresAt },
		"role":              func(f *fixture) { f.a.grant.Scope.Role = "author" },
		"lane":              func(f *fixture) { f.a.grant.Scope.Lane = "restricted" },
		"base":              func(f *fixture) { f.a.grant.Scope.BaseDigest = hash([]byte("new")) },
		"package":           func(f *fixture) { f.a.grant.Scope.PackageID = "WP-2" },
		"run":               func(f *fixture) { f.a.grant.Scope.RunID = "RUN-2" },
		"preparation":       func(f *fixture) { f.a.grant.Scope.PreparationID = "P-2" },
		"grant":             func(f *fixture) { f.a.grant.Scope.GrantID = "G-2" },
		"source":            func(f *fixture) { f.a.grant.Inputs["source"] = Source{Path: "other", SHA256: hash([]byte("new"))} },
		"output":            func(f *fixture) { f.a.grant.ProposalName = "other.json" },
		"lease extension":   func(f *fixture) { f.a.grant.ExpiresAt = f.a.grant.ExpiresAt.Add(time.Minute) },
		"stopped authority": func(f *fixture) { f.a.deny = errors.New("stopped") },
		"recorder":          func(f *fixture) { f.a.recordErr = errors.New("trace unavailable") },
		"commit":            func(f *fixture) { f.a.commitErr = errors.New("transaction failed") },
		"expires at record": func(f *fixture) { f.a.change = func() { f.now = f.a.grant.ExpiresAt } },
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			change(f)
			data, err := f.b.ReadInput(context.Background(), "source")
			if err == nil || len(data) != 0 || len(f.a.events) != 0 {
				t.Fatalf("read=%q error=%v events=%v", data, err, f.a.events)
			}
		})
	}
}
func TestCancellationAndClosedBrokerHoldRead(t *testing.T) {
	f := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if data, err := f.b.ReadInput(ctx, "source"); err == nil || len(data) != 0 {
		t.Fatal("cancelled read admitted")
	}
	if err := f.b.Close(); err != nil {
		t.Fatal(err)
	}
	if data, err := f.b.ReadInput(context.Background(), "source"); err == nil || len(data) != 0 {
		t.Fatal("closed read admitted")
	}
}
func TestInvalidRootAndGrantConfiguration(t *testing.T) {
	changes := map[string]func(*fixture){
		"same root":     func(f *fixture) { f.options.OutputDir = f.in },
		"nested output": func(f *fixture) { p := filepath.Join(f.in, "nested"); _ = os.Mkdir(p, 0700); f.options.OutputDir = p },
		"nested input":  func(f *fixture) { p := filepath.Join(f.out, "nested"); _ = os.Mkdir(p, 0700); f.options.InputDir = p },
		"symlink alias": func(f *fixture) {
			p := filepath.Join(filepath.Dir(f.in), "alias")
			_ = os.Symlink(f.in, p)
			f.options.OutputDir = p
		},
		"world writable output":   func(f *fixture) { _ = os.Chmod(f.out, 0777) },
		"no authority":            func(f *fixture) { f.options.Authority = nil },
		"zero input budget":       func(f *fixture) { f.options.MaxInputBytes = 0 },
		"overflow input budget":   func(f *fixture) { f.options.MaxInputBytes = int64(^uint64(0) >> 1) },
		"zero proposal budget":    func(f *fixture) { f.options.MaxProposalBytes = 0 },
		"unsupported role":        func(f *fixture) { f.options.Scope.Role = "author"; f.a.grant.Scope = f.options.Scope },
		"unsupported lane":        func(f *fixture) { f.options.Scope.Lane = "restricted"; f.a.grant.Scope = f.options.Scope },
		"malformed base digest":   func(f *fixture) { f.options.Scope.BaseDigest = "not-a-digest"; f.a.grant.Scope = f.options.Scope },
		"expired":                 func(f *fixture) { f.a.grant.ExpiresAt = f.now },
		"revoked":                 func(f *fixture) { f.a.grant.Revoked = true },
		"traversal":               func(f *fixture) { f.a.grant.Inputs["source"] = Source{Path: "../secret", SHA256: hash(nil)} },
		"absolute path":           func(f *fixture) { f.a.grant.Inputs["source"] = Source{Path: "/etc/passwd", SHA256: hash(nil)} },
		"backslash":               func(f *fixture) { f.a.grant.Inputs["source"] = Source{Path: `a\b`, SHA256: hash(nil)} },
		"malformed source digest": func(f *fixture) { f.a.grant.Inputs["source"] = Source{Path: "source.md", SHA256: "bad"} },
		"output traversal":        func(f *fixture) { f.a.grant.ProposalName = "../outside" },
		"output subdirectory":     func(f *fixture) { f.a.grant.ProposalName = "subdir/proposal.json" },
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			change(f)
			b, err := Open(context.Background(), f.options)
			if err == nil {
				if b != nil {
					_ = b.Close()
				}
				t.Fatal("invalid broker admitted")
			}
		})
	}
}
func TestFilesystemEscapeAndSpecialFilesHoldRead(t *testing.T) {
	for _, name := range []string{"symlink outside", "fifo", "directory"} {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			p := filepath.Join(f.in, "source.md")
			if err := os.Remove(p); err != nil {
				t.Fatal(err)
			}
			switch name {
			case "symlink outside":
				s := filepath.Join(filepath.Dir(f.in), "secret")
				_ = os.WriteFile(s, []byte("owner secret"), 0600)
				_ = os.Symlink(s, p)
			case "fifo":
				if err := syscall.Mkfifo(p, 0600); err != nil {
					t.Fatal(err)
				}
			case "directory":
				_ = os.Mkdir(p, 0700)
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			done := make(chan error, 1)
			go func() {
				data, err := f.b.ReadInput(ctx, "source")
				if len(data) > 0 {
					err = nil
				}
				done <- err
			}()
			select {
			case err := <-done:
				if err == nil {
					t.Fatal("special/escaped input admitted")
				}
			case <-ctx.Done():
				t.Fatal("special file open blocked")
			}
		})
	}
}
func TestInputRootHandleSurvivesRename(t *testing.T) {
	f := setup(t)
	old := f.in + "-renamed"
	if err := os.Rename(f.in, old); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(f.in, 0700); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(f.in, "source.md"), []byte("replacement"), 0600)
	data, err := f.b.ReadInput(context.Background(), "source")
	if err != nil || string(data) != "controlled source" {
		t.Fatalf("read=%q error=%v", data, err)
	}
}

func TestProposalReceiptBytesPermissionsAndCustody(t *testing.T) {
	f := setup(t)
	data := []byte(`{"proposal":"review me"}`)
	receipt, err := f.b.WriteProposal(context.Background(), data)
	if err != nil || receipt.SHA256 != hash(data) || receipt.Bytes != int64(len(data)) {
		t.Fatalf("receipt=%+v error=%v", receipt, err)
	}
	p := filepath.Join(f.out, "proposal.json")
	got, err := os.ReadFile(p)
	if err != nil || string(got) != string(data) {
		t.Fatalf("artifact=%q error=%v", got, err)
	}
	info, err := os.Stat(p)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("permissions=%v error=%v", info, err)
	}
	if len(f.a.events) != 1 || f.a.events[0].Operation != "write-proposal" || f.a.events[0].Artifact != "proposal.json" || f.a.events[0].SHA256 != hash(data) {
		t.Fatalf("events=%v", f.a.events)
	}
	if _, err := f.b.WriteProposal(context.Background(), []byte("overwrite")); err == nil {
		t.Fatal("overwrite admitted")
	}
	got, _ = os.ReadFile(p)
	if string(got) != string(data) || len(f.a.events) != 1 {
		t.Fatal("overwrite altered artifact or audit")
	}
}
func TestFailedProposalLeavesNoArtifactOrReceipt(t *testing.T) {
	cases := map[string]func(*fixture){
		"revoked":         func(f *fixture) { f.a.grant.Revoked = true },
		"expired":         func(f *fixture) { f.now = f.a.grant.ExpiresAt },
		"stopped":         func(f *fixture) { f.a.deny = errors.New("stopped") },
		"recorder":        func(f *fixture) { f.a.recordErr = errors.New("trace unavailable") },
		"commit":          func(f *fixture) { f.a.commitErr = errors.New("transaction failed") },
		"expiry at audit": func(f *fixture) { f.a.change = func() { f.now = f.a.grant.ExpiresAt } },
		"changed basis":   func(f *fixture) { f.a.grant.Scope.BaseDigest = hash([]byte("new basis")) },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			change(f)
			receipt, err := f.b.WriteProposal(context.Background(), []byte("proposal"))
			if err == nil || receipt != (Receipt{}) {
				t.Fatalf("receipt=%+v error=%v", receipt, err)
			}
			files, e := os.ReadDir(f.out)
			if e != nil || len(files) != 0 || len(f.a.events) != 0 {
				t.Fatalf("files=%v events=%v error=%v", files, f.a.events, e)
			}
		})
	}
}
func TestProposalBudgetCancellationAndSymlinkRefusal(t *testing.T) {
	for _, name := range []string{"oversized", "cancelled", "symlink", "closed"} {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			ctx := context.Background()
			data := []byte("proposal")
			switch name {
			case "oversized":
				data = make([]byte, 65)
			case "cancelled":
				c, cancel := context.WithCancel(ctx)
				cancel()
				ctx = c
			case "closed":
				_ = f.b.Close()
			case "symlink":
				p := filepath.Join(filepath.Dir(f.out), "secret")
				_ = os.WriteFile(p, []byte("owner secret"), 0600)
				_ = os.Symlink(p, filepath.Join(f.out, "proposal.json"))
			}
			receipt, err := f.b.WriteProposal(ctx, data)
			if err == nil || receipt != (Receipt{}) {
				t.Fatalf("receipt=%+v error=%v", receipt, err)
			}
			if name == "symlink" {
				got, _ := os.ReadFile(filepath.Join(filepath.Dir(f.out), "secret"))
				if string(got) != "owner secret" {
					t.Fatal("outside artifact changed")
				}
			}
			if len(f.a.events) != 0 {
				t.Fatalf("events=%v", f.a.events)
			}
		})
	}
}
func TestConcurrentProposalsAcrossBrokersAdmitOneWriter(t *testing.T) {
	f := setup(t)
	other, err := Open(context.Background(), f.options)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	start := make(chan struct{})
	var wg sync.WaitGroup
	success := make(chan []byte, 2)
	for i, b := range []*Broker{f.b, other} {
		wg.Add(1)
		go func(i int, b *Broker) {
			defer wg.Done()
			<-start
			data := []byte{byte(i)}
			if _, err := b.WriteProposal(context.Background(), data); err == nil {
				success <- data
			}
		}(i, b)
	}
	close(start)
	wg.Wait()
	close(success)
	var winners [][]byte
	for data := range success {
		winners = append(winners, data)
	}
	if len(winners) != 1 || len(f.a.events) != 1 {
		t.Fatalf("winners=%v events=%v", winners, f.a.events)
	}
	got, err := os.ReadFile(filepath.Join(f.out, "proposal.json"))
	if err != nil || string(got) != string(winners[0]) {
		t.Fatalf("artifact=%q error=%v", got, err)
	}
}
func TestOutputRootHandleSurvivesRename(t *testing.T) {
	f := setup(t)
	renamed := f.out + "-renamed"
	if err := os.Rename(f.out, renamed); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(filepath.Dir(f.out), "outside")
	_ = os.Mkdir(outside, 0700)
	if err := os.Symlink(outside, f.out); err != nil {
		t.Fatal(err)
	}
	if _, err := f.b.WriteProposal(context.Background(), []byte("proposal")); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(renamed, "proposal.json")); err != nil || string(data) != "proposal" {
		t.Fatalf("artifact=%q error=%v", data, err)
	}
	if _, err := os.Stat(filepath.Join(outside, "proposal.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("outside output exists: %v", err)
	}
}

func TestCancelledConstructionRefuses(t *testing.T) {
	f := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	b, err := Open(ctx, f.options)
	if err == nil {
		if b != nil {
			_ = b.Close()
		}
		t.Fatal("cancelled construction admitted")
	}
}

func TestAuthorityCannotSilentlySkipRepeatOrOmitRecorder(t *testing.T) {
	for _, kind := range []string{"skip", "twice", "nil recorder"} {
		t.Run(kind, func(t *testing.T) {
			f := setup(t)
			switch kind {
			case "skip":
				f.a.skip = true
			case "twice":
				f.a.twice = true
			case "nil recorder":
				f.a.nilRecorder = true
			}
			if data, err := f.b.ReadInput(context.Background(), "source"); err == nil || len(data) != 0 {
				t.Fatalf("read=%q error=%v", data, err)
			}
			if receipt, err := f.b.WriteProposal(context.Background(), []byte("proposal")); err == nil || receipt != (Receipt{}) {
				t.Fatalf("receipt=%+v error=%v", receipt, err)
			}
			if files, _ := os.ReadDir(f.out); len(files) != 0 || len(f.a.events) != 0 {
				t.Fatalf("files=%v events=%v", files, f.a.events)
			}
			b, err := Open(context.Background(), f.options)
			if err == nil {
				_ = b.Close()
				t.Fatal("invalid authority admitted at construction")
			}
		})
	}
}
func TestCancellationDuringAuditCleansProposal(t *testing.T) {
	f := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	f.a.change = cancel
	if receipt, err := f.b.WriteProposal(ctx, []byte("proposal")); !errors.Is(err, context.Canceled) || receipt != (Receipt{}) {
		t.Fatalf("receipt=%+v error=%v", receipt, err)
	}
	if files, _ := os.ReadDir(f.out); len(files) != 0 || len(f.a.events) != 0 {
		t.Fatalf("files=%v events=%v", files, f.a.events)
	}
}
func TestCleanupFailureIsReportedWithoutAReceipt(t *testing.T) {
	f := setup(t)
	f.a.recordErr = errors.New("audit failed")
	f.a.change = func() {
		p := filepath.Join(f.out, "proposal.json")
		_ = os.Remove(p)
		_ = os.Mkdir(p, 0700)
		_ = os.WriteFile(filepath.Join(p, "block-cleanup"), nil, 0600)
	}
	receipt, err := f.b.WriteProposal(context.Background(), []byte("proposal"))
	if err == nil || receipt != (Receipt{}) || !strings.Contains(err.Error(), "remove refused proposal") {
		t.Fatalf("receipt=%+v error=%v", receipt, err)
	}
}
func TestHostileSourceReplacementNeverReturnsUnpinnedBytes(t *testing.T) {
	f := setup(t)
	secret := filepath.Join(filepath.Dir(f.in), "secret")
	if err := os.WriteFile(secret, []byte("owner secret"), 0600); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 100; i++ {
			p := filepath.Join(f.in, "changing")
			_ = os.Symlink(secret, p)
			_ = os.Rename(p, filepath.Join(f.in, "source.md"))
			_ = os.WriteFile(p, []byte("controlled source"), 0600)
			_ = os.Rename(p, filepath.Join(f.in, "source.md"))
		}
	}()
	for i := 0; i < 100; i++ {
		data, err := f.b.ReadInput(context.Background(), "source")
		if err == nil && string(data) != "controlled source" {
			t.Errorf("unpinned bytes: %q", data)
		}
		if err != nil && len(data) != 0 {
			t.Errorf("error leaked bytes: %q", data)
		}
	}
	<-done
}
