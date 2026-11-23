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

// agentUpdates holds what the startup check found.
type agentUpdates struct {
	mu      sync.Mutex
	checked bool
	list    []AgentUpdate
}

// set replaces the list with what a check found. An agent the check could not finish (no answer
// from the registry, or no version from the CLI) keeps what was known before, so an incomplete check
// never hides an update already found.
func (u *agentUpdates) set(sts []agentupdate.Status) {
	u.mu.Lock()
	defer u.mu.Unlock()
	prev := u.list
	u.checked = true
	next := []AgentUpdate{}
	for _, s := range sts {
		switch {
		case s.Outdated():
			next = append(next, AgentUpdate{Agent: s.Agent.ID, Name: s.Agent.Name, Installed: s.Installed, Latest: s.Latest,
				NpmGlobal: s.Command != nil, Note: clipTo(s.Note, 300)})
		case s.Incomplete():
			for _, p := range prev {
				if p.Agent == s.Agent.ID {
					next = append(next, p)
				}
			}
		}
	}
	u.list = next
}

// report is what the next claim carries: nil until the startup check has finished, so the control
// plane keeps what it had; the list (possibly empty, sent as []) once it has.
func (u *agentUpdates) report() []AgentUpdate {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !u.checked {
		return nil
	}
	return append(make([]AgentUpdate, 0, len(u.list)), u.list...)
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
