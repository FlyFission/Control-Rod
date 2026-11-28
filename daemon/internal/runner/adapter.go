package runner

import (
	"context"
	"os"
	"os/exec"
	"strings"
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
// returns true is refused without a policy and receives AgentEnv. Only the fake runtime and the
// practice runtimes return false. Detect offers the fake one only when CONTROLROD_ALLOW_FAKE=1. The
// practice runtimes start no process at all (PracticeRunner).
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
// An empty gap means the runtime is confined on this platform.
type AwaitingConfinement interface {
	ConfinementGap() string
}

// confinementRefusal is the refusal for a runtime that is awaiting confinement, or nil.
func confinementRefusal(a Adapter) error {
	if w, ok := a.(AwaitingConfinement); ok {
		if gap := w.ConfinementGap(); gap != "" {
			return refuse("%s cannot run work yet: %s", a.DisplayName(), gap)
		}
	}
	return nil
}

// macOSOnly is a runtime Control Rod confines on macOS alone (its ConfinementGap is empty there and
// nowhere else). It is found and listed on other platforms, and never started there.
type macOSOnly interface {
	MacOSOnly()
}

// MacOSOnlyRuntime reports whether a runtime runs on macOS only, so setup and doctor can say so.
func MacOSOnlyRuntime(rt string) bool {
	a, ok := AdapterFor(rt)
	if !ok {
		return false
	}
	_, only := a.(macOSOnly)
	return only
}

// NoRuntimeMessage is the daemon's refusal when no agent CLI is on PATH. It names every runtime
// Control Rod can start on this platform, and the ones it starts on macOS only.
func NoRuntimeMessage(goos string) string {
	var here, mac []string
	for _, a := range registry {
		// Only real vendor CLIs: the ones the subscriptions page lists (the fake runtime is not one).
		if l, ok := a.(subscriptionCLI); !ok || !l.ListOnSubscriptions() {
			continue
		}
		_, only := a.(macOSOnly)
		if only && goos != "darwin" {
			mac = append(mac, a.DisplayName())
			continue
		}
		if w, ok := a.(AwaitingConfinement); ok && !only && w.ConfinementGap() != "" {
			continue
		}
		here = append(here, a.DisplayName())
	}
	msg := "no agent runtime found: install " + joinOr(here)
	if len(mac) > 0 {
		msg += " (" + joinAnd(mac) + " run on macOS only)"
	}
	return msg
}

func joinOr(names []string) string  { return joinWords(names, "or") }
func joinAnd(names []string) string { return joinWords(names, "and") }

func joinWords(names []string, word string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	}
	return strings.Join(names[:len(names)-1], ", ") + " " + word + " " + names[len(names)-1]
}

// workspaceRooter places a runtime's author and intake workspaces under a root of its own instead
// of the daemon's home. The argument is the daemon's home.
type workspaceRooter interface {
	WorkspaceRoot(daemonHome string) (string, error)
}

// selfConfinedChecker is a runtime whose checker is not wrapped in Control Rod's outer checker
// mount, because its own sandbox cannot start inside one. Its Command carries the checker's
// limits instead, and the deliverable tree is still hashed before and after the run.
// runSerializer is a runtime whose runs must not overlap on this machine: the daemon holds the
// release from before the workspace is made until the run's folder is removed.
type runSerializer interface {
	SerializeRuns(ctx context.Context) (func(), error)
}

// removeRunRoot removes a run folder made by a workspaceRooter, clearing any immutable flag first.
func removeRunRoot(dir string) {
	if dir == "" {
		return
	}
	_ = setImmutable(dir, false)
	_ = os.RemoveAll(dir)
}

type selfConfinedChecker interface {
	SelfConfinedChecker() bool
}

func selfConfined(a Adapter) bool {
	s, ok := a.(selfConfinedChecker)
	return ok && s.SelfConfinedChecker()
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
	withFeatures(CodexFeatureLister) codexSwitchPreflight
}

// codexSwitchPreflight is a preflight that may answer with features to switch off at launch.
type codexSwitchPreflight interface {
	CLIPreflight
	PreflightSwitches(ctx context.Context, run CommandRunner) ([]string, error)
}

// ArtifactStager launches from a staged copy of the install tree.
type ArtifactStager interface {
	StagesArtifact() bool
}

// ExecCopier launches from a staged copy of its single-file executable where the platform
// starts a runtime by its path after hashing it (not Linux; see copiesBeforeExec).
type ExecCopier interface {
	CopiesBeforeExec() bool
}

// OutputCopier fills out/ when Command returns no process. Only the fake runtime implements it.
type OutputCopier interface {
	CopyOutputs(ws *Workspace) error
}

// PracticeRunner does a run's role inside the daemon when Command returns no process, narrating
// each step through emit. Only the practice runtimes implement it.
type PracticeRunner interface {
	RunPractice(ctx context.Context, run Run, ws *Workspace, emit func([]Event)) error
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
	practiceAuthor,
	practiceChecker,
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
