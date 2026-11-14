package runner

import (
	"context"
	"os/exec"
	"time"
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
var registry = []Adapter{claudeAdapter{}, codexAdapter{}, fakeAdapter{}}

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
