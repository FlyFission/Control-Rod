package runner

import (
	"context"
	"os/exec"
	"time"
)

// Capabilities describes an adapter. Milestone 1 records it and does not read it to choose
// a launch, a probe, a sandbox or a model.
type Capabilities struct {
	Roles            []string
	OutputFormat     string
	ToolAllowlist    bool
	NativeSandbox    string
	NetworkHostLimit bool
	MultiVendor      bool
	ConfigIsolation  []string
}

// Adapter is one agent CLI: how it is found, launched, probed and read. The methods below the
// stream pair carry branches that used to switch on the runtime name in the runner. Each one
// calls the same helper as that branch did.
type Adapter interface {
	ID() string
	Binary() string
	Capabilities() Capabilities
	// Providers are the run-record names that select this runtime, already lower-case.
	Providers() []string
	// Available reports whether Detect offers this runtime. lookPath is the PATH lookup Detect
	// was given; getenv is the process environment.
	Available(lookPath func(string) (string, error), getenv func(string) string) bool

	Probe(ctx context.Context, run CommandRunner) RuntimeStatus
	Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error)
	LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch
	Normalize(line string, now time.Time) []Event
	TurnEnd(line string) (ended, failed bool)

	SandboxRequired() bool
	PrepareRun(ws *Workspace, daemonHome, runID string) (removeHook bool, events []Event)
	UsesVerifiedLaunch() bool
	ExtraHostNeeds() []HostNeed
	DisplayName() string
	PreflightCLI(ctx context.Context, run CommandRunner, features func(context.Context) (string, error)) error
	CheckManagedConfig(files []string) error
	StagesArtifact() bool
	CopyOutputs(ws *Workspace) error
}

// Adapters is the runtime registry, in the order Detect offers them.
var Adapters = []Adapter{claudeAdapter{}, codexAdapter{}, fakeAdapter{}}

// AdapterFor returns the adapter with this id.
func AdapterFor(id string) (Adapter, bool) {
	for _, a := range Adapters {
		if a.ID() == id {
			return a, true
		}
	}
	return nil, false
}

// probeDispatched runs the adapter probe. The fake runtime's version is the daemon version, which
// the adapter method does not receive; Probe applies it here, as it did before the registry.
func probeDispatched(ctx context.Context, runtime, fakeVersion string, run CommandRunner) (RuntimeStatus, bool) {
	a, ok := AdapterFor(runtime)
	if !ok {
		return RuntimeStatus{}, false
	}
	st := a.Probe(ctx, run)
	if a.ID() == RuntimeFake {
		st.Ready = true
		st.Version = fakeVersion
	}
	return st, true
}
