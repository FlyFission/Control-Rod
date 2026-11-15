package runner

import (
	"context"
	"encoding/json"
	"os"
	"runtime"
	"strings"
)

// Auth states a subscription probe may report. The words are fixed. The CLI's
// own stdout is never stored: a status command can print account material, and
// Control Rod does not read or copy a token (ADR 0021).
const (
	authSignedIn  = "signed-in"
	authSignedOut = "signed-out"
	authUnknown   = "unknown"

	noteSignedIn     = "The CLI's status command succeeded."
	noteSignedOut    = "The CLI's status command did not succeed."
	noteNoCommand    = "This CLI has no auth-status command."
	noteNotRun       = "The status command could not be run."
	noteNotInstalled = "Auth was not checked because the CLI is not installed."

	// localCheckerRule is the admission rule in Admit: a local model cannot
	// decide Safety or Material. Milestone M10 states the same rule.
	localCheckerRule = "A local model cannot be the deciding checker on Safety or Material."
)

// familyNamer is the vendor family an adapter belongs to. Adapters that do not
// implement it have no family, and the page does not invent one.
type familyNamer interface {
	Family() string
}

// authStatusCommand is the CLI's own auth-status command. An adapter that does
// not implement it has no such command, so the probe reports auth unknown.
type authStatusCommand interface {
	AuthStatusArgs() []string
	ConfirmAuthCommand(call func(args ...string) (string, int, error)) bool
}

// apiKeyCLI authenticates only with an API key. Control Rod does not list it
// and does not ask for the key (ADR 0021).
type apiKeyCLI interface {
	APIKeyOnly() bool
}

// subscriptionCLI is a provider CLI the settings page may list. The fake
// runtime returns false. An adapter that does not implement it is not listed.
type subscriptionCLI interface {
	ListOnSubscriptions() bool
}

// authorQualification is true for a CLI whose author launch is in the
// qualified set. Checker launches are not qualified on any platform.
type authorQualification interface {
	AuthorLaunchQualified() bool
}

// SubscriptionProbe is one registered provider CLI. It is produced by running
// that adapter's probe and, when the adapter has one, its own status command.
type SubscriptionProbe struct {
	ID              string              `json:"id"`
	DisplayName     string              `json:"display_name"`
	VendorFamily    string              `json:"vendor_family,omitempty"`
	Installed       bool                `json:"installed"`
	Path            string              `json:"path,omitempty"`
	ObservedVersion string              `json:"observed_version,omitempty"`
	Auth            string              `json:"auth"`
	AuthNote        string              `json:"auth_note,omitempty"`
	Roles           []RoleQualification `json:"roles"`
}

// RoleQualification is the milestone's per-role record for this platform.
// Checker is the pre-check role.
type RoleQualification struct {
	Role      string `json:"role"`
	Qualified bool   `json:"qualified"`
	Reason    string `json:"reason"`
}

// SubscriptionChecker is one model in the daemon's registry. It is not a live
// probe of a running model.
type SubscriptionChecker struct {
	ID           string   `json:"id"`
	Harness      string   `json:"harness"`
	VendorFamily string   `json:"vendor_family,omitempty"`
	Deciding     bool     `json:"deciding"`
	Local        bool     `json:"local"`
	Hosts        []string `json:"hosts"`
}

// SubscriptionReport is what a claim sends and what the settings page shows.
type SubscriptionReport struct {
	Platform  string                `json:"platform"`
	Probes    []SubscriptionProbe   `json:"probes"`
	Checkers  []SubscriptionChecker `json:"checkers"`
	LocalRule string                `json:"local_rule"`
}

// listsSubscription reports whether the subscriptions page may list this adapter.
// The fake runtime is not a provider CLI. An API-key-only CLI is excluded.
func listsSubscription(a Adapter) bool {
	if k, ok := a.(apiKeyCLI); ok && k.APIKeyOnly() {
		return false
	}
	s, ok := a.(subscriptionCLI)
	return ok && s.ListOnSubscriptions()
}

func authorQualified(id string) bool {
	a, ok := AdapterFor(id)
	if !ok {
		return false
	}
	q, ok := a.(authorQualification)
	return ok && q.AuthorLaunchQualified()
}

func familyOf(a Adapter) string {
	if f, ok := a.(familyNamer); ok {
		return f.Family()
	}
	return ""
}

// HostPlatform names the host the way the milestone distinguishes qualification.
// osrelease is the contents of /proc/sys/kernel/osrelease, or empty when that
// file does not exist.
func HostPlatform(goos, osrelease string) string {
	if goos == "linux" {
		if strings.Contains(strings.ToLower(osrelease), "microsoft") {
			return "wsl2"
		}
		return "linux"
	}
	if goos == "darwin" {
		return "darwin"
	}
	if goos == "" {
		return "unknown"
	}
	return goos
}

// CurrentPlatform reads this process's OS and, on Linux, the kernel release.
func CurrentPlatform() string {
	rel := ""
	if b, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		rel = string(b)
	}
	return HostPlatform(runtime.GOOS, rel)
}

// seatbeltQualified is the macOS record the milestone names. Only the exact
// value 1 counts. It does not change QualifiedPlatform, which still refuses
// a launch on macOS and native Linux.
func seatbeltQualified(getenv func(string) string) bool {
	if getenv == nil {
		return false
	}
	return getenv("CONTROLROD_SEATBELT_QUALIFIED") == "1"
}

// qualify is the milestone matrix. Author launches of Claude Code and Codex
// are the only qualified cells, and only on WSL2, or on macOS when
// CONTROLROD_SEATBELT_QUALIFIED is 1. Checker launches are not qualified.
func qualify(id, role, platform string, seatbelt bool) (bool, string) {
	authorCLI := role == "author" && authorQualified(id)
	switch platform {
	case "wsl2":
		if authorCLI {
			return true, "WSL2 is qualified for this CLI's author launches."
		}
		return false, "WSL2 is qualified for Claude Code and Codex author launches only."
	case "darwin":
		if !seatbelt {
			return false, "macOS is not qualified until CONTROLROD_SEATBELT_QUALIFIED is set."
		}
		if authorCLI {
			return true, "macOS author launches are qualified because CONTROLROD_SEATBELT_QUALIFIED is set."
		}
		return false, "macOS is not qualified for this role."
	case "linux":
		return false, "Native Linux is not qualified."
	default:
		return false, "This platform is not qualified."
	}
}

func roleQualifications(id, platform string, seatbelt bool) []RoleQualification {
	out := make([]RoleQualification, 0, 2)
	for _, role := range []string{"author", "checker"} {
		ok, reason := qualify(id, role, platform, seatbelt)
		out = append(out, RoleQualification{Role: role, Qualified: ok, Reason: reason})
	}
	return out
}

// publicText drops a line that carries credential material. A version or path
// is kept only when it does not look like a token.
func publicText(line string) string {
	low := strings.ToLower(line)
	for _, bad := range []string{"sk-", "api_key", "api-key", "token", "bearer ", "ghp_", "xox"} {
		if strings.Contains(low, bad) {
			return ""
		}
	}
	return line
}

func probeFromStatus(a Adapter, st *RuntimeStatus, platform string, seatbelt bool) SubscriptionProbe {
	p := SubscriptionProbe{
		ID:           a.ID(),
		DisplayName:  a.DisplayName(),
		VendorFamily: familyOf(a),
		Auth:         authUnknown,
		Roles:        roleQualifications(a.ID(), platform, seatbelt),
	}
	if st == nil {
		p.AuthNote = noteNotInstalled
		return p
	}
	executed := st.Artifact != nil || st.Version != ""
	p.Installed = executed || strings.Contains(st.Reason, "is installed")
	if st.Artifact != nil {
		p.Path = publicText(st.Artifact.Path)
	}
	p.ObservedVersion = publicText(st.Version)
	if !executed {
		if p.Installed {
			p.AuthNote = noteNotRun
		} else {
			p.AuthNote = noteNotInstalled
		}
		return p
	}
	p.Auth, p.AuthNote = authFromStatus(a, *st)
	return p
}

// authFromStatus reads the probe the daemon already ran. It does not run the
// CLI again: the scheduled probe's version command and preflight are the two
// runs a check is allowed. The status command's output is not on the status.
func authFromStatus(a Adapter, st RuntimeStatus) (string, string) {
	if _, ok := a.(authStatusCommand); !ok {
		return authUnknown, noteNoCommand
	}
	if strings.Contains(strings.ToLower(st.Reason), "not signed in") {
		return authSignedOut, noteSignedOut
	}
	if st.LoginChecked || st.Ready {
		return authSignedIn, noteSignedIn
	}
	return authUnknown, noteNotRun
}

// authOf runs the adapter's own status command and keeps only the exit class.
// The command's output is discarded.
func authOf(ctx context.Context, a Adapter, run CommandRunner) (string, string) {
	auth, ok := a.(authStatusCommand)
	if !ok || len(auth.AuthStatusArgs()) == 0 {
		return authUnknown, noteNoCommand
	}
	call := func(args ...string) (string, int, error) {
		c, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		return run(c, a.Binary(), args...)
	}
	if !auth.ConfirmAuthCommand(call) {
		return authUnknown, noteNoCommand
	}
	_, code, err := call(auth.AuthStatusArgs()...)
	if err != nil {
		return authUnknown, noteNotRun
	}
	if code == 0 {
		return authSignedIn, noteSignedIn
	}
	return authSignedOut, noteSignedOut
}

func checkerModels() []SubscriptionChecker {
	reg, err := DefaultModels()
	if err != nil {
		return []SubscriptionChecker{}
	}
	out := make([]SubscriptionChecker, 0, len(reg.Models))
	for _, m := range reg.Models {
		fam := ""
		if a, ok := AdapterFor(m.Harness); ok {
			fam = familyOf(a)
		}
		hosts := append([]string(nil), m.Hosts...)
		out = append(out, SubscriptionChecker{
			ID: m.ID, Harness: m.Harness, VendorFamily: fam,
			Deciding: m.Deciding, Local: m.Local, Hosts: hosts,
		})
	}
	return out
}

// SubscriptionFromStatuses builds the settings report from probes the daemon
// already ran. A registered provider CLI with no status was not installed.
// The fake runtime and an API-key-only CLI are left out.
func SubscriptionFromStatuses(statuses []RuntimeStatus, platform string, getenv func(string) string) SubscriptionReport {
	seatbelt := seatbeltQualified(getenv)
	byID := map[string]RuntimeStatus{}
	for _, st := range statuses {
		byID[st.Runtime] = st
	}
	probes := make([]SubscriptionProbe, 0, 2)
	for _, a := range RegisteredAdapters() {
		if !listsSubscription(a) {
			continue
		}
		st, ok := byID[a.ID()]
		if ok {
			probes = append(probes, probeFromStatus(a, &st, platform, seatbelt))
			continue
		}
		probes = append(probes, probeFromStatus(a, nil, platform, seatbelt))
	}
	return SubscriptionReport{
		Platform:  platform,
		Probes:    probes,
		Checkers:  checkerModels(),
		LocalRule: localCheckerRule,
	}
}

// ReportJSON is the report encoded for tests that assert a token never appears.
func ReportJSON(r SubscriptionReport) string {
	b, err := json.Marshal(r)
	if err != nil {
		return ""
	}
	return string(b)
}
