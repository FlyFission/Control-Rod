package runner

import (
	"context"
	"strings"
	"sync"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

// AgentUpdate is an agent CLI with a newer version, as the daemon reports it (spec
// Runner.AgentUpdate). No command text is reported: NpmGlobal says the npm command applies, and the
// app builds it from a fixed package per agent and Latest. The daemon never installs.
type AgentUpdate struct {
	Agent     string `json:"agent"`
	Name      string `json:"name"`
	Installed string `json:"installed,omitempty"`
	Latest    string `json:"latest"`
	NpmGlobal bool   `json:"npm_global,omitempty"`
	Note      string `json:"note,omitempty"`
}

// AgentReport is what a claim carries after the check: the outdated agents and the agents whose
// check could not finish, for which the control plane keeps what it knew.
type AgentReport struct {
	List      []AgentUpdate
	Unchecked []UncheckedAgent
}

// UncheckedAgent is an agent whose check could not finish, with the installed version read
// (strict SemVer, or left out).
type UncheckedAgent struct {
	Agent     string `json:"agent"`
	Installed string `json:"installed,omitempty"`
}

// agentUpdates holds what the startup check found.
type agentUpdates struct {
	mu        sync.Mutex
	checked   bool
	list      []AgentUpdate
	unchecked []UncheckedAgent
	// seen is, per agent ID, its binary and the stamp taken when its version was read.
	seen map[string][2]string
}

// set replaces the report with what a check found. An agent the check could not finish (no answer
// from the registry, or no strict SemVer version from the CLI or the registry) is listed as
// unchecked and keeps an entry this daemon already had only while that entry's installed version is
// the one read now; the control plane applies the same rule to its own row. An update is never
// kept for a CLI updated since, so no older version is offered.
func (u *agentUpdates) set(sts []agentupdate.Status) {
	u.mu.Lock()
	defer u.mu.Unlock()
	prev := u.list
	u.checked = true
	next, unchecked := []AgentUpdate{}, []UncheckedAgent{}
	u.seen = map[string][2]string{}
	for _, s := range sts {
		u.seen[s.Agent.ID] = [2]string{s.Agent.Binary, s.Stamp}
		switch {
		case s.Agent.Package == "":
			// Not checked at all (no known package): nothing to report.
		case s.Incomplete() || !agentupdate.StrictVersion(s.Installed) || !agentupdate.StrictVersion(s.Latest):
			installed := ""
			if agentupdate.StrictVersion(s.Installed) {
				installed = s.Installed
			}
			unchecked = append(unchecked, UncheckedAgent{Agent: s.Agent.ID, Installed: installed})
			for _, p := range prev {
				if p.Agent == s.Agent.ID && installed != "" && p.Installed == installed {
					next = append(next, p)
				}
			}
		case s.Outdated():
			next = append(next, AgentUpdate{Agent: s.Agent.ID, Name: s.Agent.Name, Installed: s.Installed, Latest: s.Latest,
				NpmGlobal: s.Command != nil, Note: clipTo(s.Note, 300)})
		}
	}
	u.list, u.unchecked = next, unchecked
}

// report is what the next claim carries: none until the startup check has finished, so the control
// plane keeps what it had; then the list (possibly empty, sent as []) and the unchecked agents.
//
// stamp, when set, says what each agent's binary on PATH is now (agentupdate.Stamp: a file stat, no
// process and no network). An agent whose binary changed since its version was read, because it
// was installed, updated or removed while the daemon ran, loses its update and the installed
// version on its unchecked entry, for good: the version read at startup may no longer be the one
// installed, so the update could offer the same version or an older one. The next startup check
// reads it again.
func (u *agentUpdates) report(stamp func(binary string) string) []AgentReport {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !u.checked {
		return nil
	}
	if stamp != nil {
		changed := func(id string) bool {
			s := u.seen[id] // every reported agent was seen by the check that reported it
			return stamp(s[0]) != s[1]
		}
		kept := u.list[:0:0]
		for _, e := range u.list {
			if !changed(e.Agent) {
				kept = append(kept, e)
			}
		}
		u.list = kept
		for i := range u.unchecked {
			if u.unchecked[i].Installed != "" && changed(u.unchecked[i].Agent) {
				u.unchecked[i].Installed = ""
			}
		}
	}
	return []AgentReport{{List: append([]AgentUpdate{}, u.list...), Unchecked: append([]UncheckedAgent(nil), u.unchecked...)}}
}

func clipTo(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// checkAgentUpdates runs the update check once and logs any agent with a newer version. It installs
// nothing: the person runs `controlrod agents update`, or the command the app shows.
func (d *Daemon) checkAgentUpdates(ctx context.Context) {
	c, cancel := context.WithTimeout(ctx, agentupdate.CheckTimeout)
	defer cancel()
	sts := d.cfg.UpdateCheck(c)
	d.updates.set(sts)
	if msg := agentupdate.Summary(sts); msg != "" {
		d.log.Info(msg)
	}
}
