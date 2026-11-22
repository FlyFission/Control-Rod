package runner

import (
	"context"
	"os/exec"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/binaryutil"
)

// Capabilities describes an adapter. Nothing reads it to choose a launch, a probe, a sandbox
// or a model.
type Capabilities struct {
	Roles            []string
	OutputFormat     string
	ToolAllowlist    bool
	NativeSandbox    string
	NetworkHostLimit bool
	MultiVendor      bool
	ConfigIsolation  []string
}

// Adapter is one agent CLI. SandboxRequired is the security gate Command uses: a runtime that
// returns true is refused without a policy and receives AgentEnv. Only the fake runtime returns
// false, and Detect offers it only when CONTROLROD_ALLOW_FAKE=1.
type Adapter interface {
	ID() string
	Binary() string
	DisplayName() string
	Capabilities() Capabilities
	// Providers are the run-record names that select this runtime, already lower-case.
	Providers() []string
	// Available reports whether Detect offers this runtime. Binary() is the executable a
	// launch runs; Available is not required to probe that name. The fake runtime is offered
	// only when CONTROLROD_ALLOW_FAKE=1, not because bash was found. A later milestone may
	// revisit that.
	Available(lookPath func(string) (string, error), getenv func(string) string) bool
	// Probe checks the runtime. version is the daemon version, used by the fake runtime; other
	// adapters ignore it and record the CLI's own --version.
	Probe(ctx context.Context, version string, run CommandRunner) RuntimeStatus
	Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error)
	LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch
	Normalize(line string, now time.Time) []Event
	TurnEnd(line string) (ended, failed bool)
	SandboxRequired() bool
}

// AwaitingConfinement is a runtime Control Rod can detect and probe but cannot yet confine. Its
// CLI has no sandbox Control Rod configures from the run's policy, and no outer sandbox wraps it,
// so a run on it would reach the whole machine. PreflightHost and Command refuse it with the gap
// as the reason: it is listed as not ready and never started. An adapter leaves this interface
// when its confinement is built and qualified (ADR 0021), under its own change record.
type AwaitingConfinement interface {
	ConfinementGap() string
}

// confinementRefusal is the refusal for a runtime that is awaiting confinement, or nil.
func confinementRefusal(a Adapter) error {
	if w, ok := a.(AwaitingConfinement); ok {
		return refuse("%s cannot run work yet: %s", a.DisplayName(), w.ConfinementGap())
	}
	return nil
}

// HookProvider records a permission-hook file for the run. The caller removes it.
type HookProvider interface {
	PrepareHook(ws *Workspace, daemonHome, runID string) (remove bool)
}

// LaunchNotifier returns events recorded before the process starts.
type LaunchNotifier interface {
	LaunchNotice(now time.Time) []Event
}

// HostNeeder names extra programs the sandbox needs on Linux.
type HostNeeder interface {
	ExtraHostNeeds() []HostNeed
}

// ManagedConfigChecker refuses a run when managed configuration can loosen the sandbox.
type ManagedConfigChecker interface {
	CheckManagedConfig(files []string) error
}

// CLIPreflight runs the CLI to check sign-in and, for Codex, qualified features.
type CLIPreflight interface {
	PreflightCLI(ctx context.Context, run CommandRunner) error
}

// codexFeaturePreflight copies a Codex adapter with the feature lister Preflight was given.
// The registry value keeps a nil lister, which means CodexEffectiveFeatures.
type codexFeaturePreflight interface {
	withFeatures(func(context.Context) (string, error)) CLIPreflight
}

// ArtifactStager launches from a staged copy of the install tree.
type ArtifactStager interface {
	StagesArtifact() bool
}

// OutputCopier fills out/ when Command returns no process. Only the fake runtime implements it.
type OutputCopier interface {
	CopyOutputs(ws *Workspace) error
}

// loginKeeper names this CLI's login directory, the credential file a checker may
// refresh, and the session directories that must not be the real ones. A checker
// gets an empty per-run directory mounted over each session directory. The
// credential file is the one LoginLocations already names. The session directory
// names were not remeasured against a live CLI.
type loginKeeper interface {
	LoginDir(home string, getenv func(string) string) string
	LoginWritableFiles() []string
	LoginSessionDirs() []string
}

// checkerEnv is set only for a sandboxed pre-check. Author launches do not receive it.
type checkerEnv interface {
	CheckerEnv() []string
}

// ExtraEnvProvider adds variables after Command has chosen AgentEnv or ChildEnv.
// Command drops provider provenance keys (*_BASE_URL, *_MODEL, *_TOKEN, *_API_KEY)
// from this list before the process sees them.
type ExtraEnvProvider interface {
	ExtraEnv() []string
}

// StreamMetadataParser supplies the log label and reported model for one stream line.
// Adapters that do not implement it use LabelFor and ReportedModel.
type StreamMetadataParser interface {
	StreamLabel(line string) string
	StreamModel(line string) string
}

// streamBase parses with the shared normalizer. Every current adapter embeds it.
type streamBase struct{}

func (streamBase) Normalize(line string, now time.Time) []Event { return Normalize(line, now) }
func (streamBase) TurnEnd(line string) (bool, bool)             { return TurnEnd(line) }

// sandboxedBase is a runtime Command will not start without a policy.
type sandboxedBase struct{ streamBase }

func (sandboxedBase) SandboxRequired() bool { return true }

// registry is the runtime list, in the order Detect offers them. It is not exported: callers
// use RegisteredAdapters, which returns a copy.
var registry = []Adapter{
	claudeAdapter{},
	codexAdapter{},
	grokAdapter{},
	opencodeAdapter{},
	agyAdapter{},
	ollamaAdapter{},
	fakeAdapter{},
}

// RegisteredAdapters returns a copy of the registry. Mutating the slice does not change it.
func RegisteredAdapters() []Adapter {
	out := make([]Adapter, len(registry))
	copy(out, registry)
	return out
}

// AdapterFor returns the adapter with this id.
func AdapterFor(id string) (Adapter, bool) {
	for _, a := range registry {
		if a.ID() == id {
			return a, true
		}
	}
	return nil, false
}

// availableBinary reports whether lookPath finds the adapter's executable. The name looked up
// is Binary(), the PATH name, which for Claude and Codex equals the runtime id.
func availableBinary(a Adapter, lookPath func(string) (string, error)) bool {
	_, err := lookPath(a.Binary())
	return err == nil
}

// BinarySpecifier describes how an adapter's CLI executable is resolved and verified.
type BinarySpecifier interface {
	BinarySpec() binaryutil.BinarySpec
}

// SpecForAdapter returns the BinarySpec for a, falling back to DisplayName and Binary.
func SpecForAdapter(a Adapter) binaryutil.BinarySpec {
	if bs, ok := a.(BinarySpecifier); ok {
		return bs.BinarySpec()
	}
	return binaryutil.BinarySpec{
		Label: a.DisplayName(),
		Names: []string{a.Binary()},
	}
}

// ResolveAdapterBinary resolves a's executable using the allowlisted AgentEnv derived
// from environ (never full login-shell environment variables).
func ResolveAdapterBinary(ctx context.Context, a Adapter, environ []string) (string, error) {
	return binaryutil.ResolveBinary(ctx, SpecForAdapter(a), AgentEnv(environ))
}
