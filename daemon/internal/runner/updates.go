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
	Unchecked []string
}

// agentUpdates holds what the startup check found.
type agentUpdates struct {
	mu        sync.Mutex
	checked   bool
	list      []AgentUpdate
	unchecked []string
}

// set replaces the report with what a check found. An agent the check could not finish (no answer
// from the registry, or no strict SemVer version from the CLI or the registry) is listed as
// unchecked and keeps any entry this daemon already had; the control plane keeps its own too.
func (u *agentUpdates) set(sts []agentupdate.Status) {
	u.mu.Lock()
	defer u.mu.Unlock()
	prev := u.list
	u.checked = true
	next, unchecked := []AgentUpdate{}, []string{}
	for _, s := range sts {
		switch {
		case s.Agent.Package == "":
			// Not checked at all (no known package): nothing to report.
		case s.Incomplete() || !agentupdate.StrictVersion(s.Installed) || !agentupdate.StrictVersion(s.Latest):
			unchecked = append(unchecked, s.Agent.ID)
			for _, p := range prev {
				if p.Agent == s.Agent.ID {
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
func (u *agentUpdates) report() []AgentReport {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !u.checked {
		return nil
	}
	return []AgentReport{{List: append([]AgentUpdate{}, u.list...), Unchecked: append([]string(nil), u.unchecked...)}}
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
