package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"syscall"
	"time"
)

// Containment modes (specification 22). A run's processes live in one containment unit, so the
// daemon can freeze, signal and kill all of them and know when every one has exited.
const (
	// ContainCgroup runs each run in its own systemd user scope: a kernel cgroup that survives the
	// daemon, can be frozen, killed atomically (cgroup.kill) and reports when it is empty.
	ContainCgroup = "cgroup"
	// ContainGroup is the fallback where no user systemd is available: the run's process group,
	// signalled through a pidfd where the platform has one. A process that leaves the group, or a
	// group id reused after the group empties, is outside what this mode can see.
	ContainGroup = "process-group"
)

var unitChars = regexp.MustCompile(`[^A-Za-z0-9_-]`)

// Namespace names one daemon home: scopes carry it, so a daemon only ever sweeps scopes its own
// home started (another daemon with another home is left alone). One daemon at a time holds a
// home (LockHome).
func Namespace(home string) string {
	abs, err := filepath.Abs(home)
	if err != nil {
		abs = home
	}
	sum := sha256.Sum256([]byte(abs))
	return hex.EncodeToString(sum[:])[:10]
}

// UnitName is the systemd scope name for a run attempt under a daemon namespace. It is
// deterministic, so a restarted daemon recognizes its own scopes even when a receipt was never written.
func UnitName(ns, runID string, generation int) string {
	return fmt.Sprintf("%s%s-g%d", UnitPrefix(ns), unitChars.ReplaceAllString(runID, "_"), max(generation, 1))
}

// UnitPrefix starts the name of every run scope of one daemon namespace.
func UnitPrefix(ns string) string { return "controlrod-run-" + ns + "-" }

// Container launches commands into containment units of one mode.
type Container struct {
	Mode string
	// ScopeParent is the cgroup directory new scopes appear under (cgroup mode).
	ScopeParent string
	// NS is the daemon namespace whose scopes this container may sweep.
	NS string
}

// Wrap rewrites cmd so it starts inside a new unit named unit.
func (k Container) Wrap(cmd *exec.Cmd, unit string) {
	setProcessGroup(cmd)
	if k.Mode != ContainCgroup {
		return
	}
	args := append([]string{"systemd-run", "--user", "--scope", "--quiet", "--collect", "--unit=" + unit, "--"}, cmd.Args...)
	path, err := exec.LookPath("systemd-run")
	if err != nil {
		return
	}
	// systemd-run moves itself into the scope and then executes the command, keeping its process
	// group, environment and working directory.
	cmd.Path, cmd.Args = path, args
}

// Unit is one run's containment unit as the receipt records it.
type Unit struct {
	Mode   string
	Name   string
	Cgroup string // absolute cgroup directory (cgroup mode)
	PGID   int
}

// Locate finds the unit a just-started process runs in. In cgroup mode it waits for systemd-run
// to have moved the process into its scope; a process that never arrives is not contained.
func (k Container) Locate(pid int, unit string) (Unit, error) {
	u := Unit{Mode: k.Mode, Name: unit, PGID: pid}
	if k.Mode != ContainCgroup {
		return u, nil
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		dir, err := cgroupOf(pid)
		if err == nil && hasSuffix(dir, "/"+unit+".scope") {
			u.Cgroup = dir
			return u, nil
		}
		// A process that already exited may have left before it could be seen in its scope; the
		// scope's place is known, and an empty or collected scope simply holds nothing.
		if err != nil && k.ScopeParent != "" && !processExists(pid) {
			u.Cgroup = k.ScopeParent + "/" + unit + ".scope"
			return u, nil
		}
		if time.Now().After(deadline) {
			return u, fmt.Errorf("process %d never entered scope %s", pid, unit)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func hasSuffix(s, suf string) bool { return len(s) >= len(suf) && s[len(s)-len(suf):] == suf }

// errNoIdentityToSignal means the fallback cannot signal: the group's leader no longer matches the
// receipt (or cannot be pinned), so the group number alone does not prove whose processes these are.
var errNoIdentityToSignal = errors.New("the run's leader is gone, so its process group cannot be identified")

// Signals of the stop ladder, named so callers need no syscall import.
var (
	SigHangup = syscall.SIGHUP
	SigTerm   = syscall.SIGTERM
)
