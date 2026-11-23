package runner

import (
	"context"
	"strings"
	"sync"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

// AgentUpdate is an agent CLI with a newer version, as the daemon reports it (spec
// Runner.AgentUpdate). Command is what the person can run in a terminal to install it; the daemon
// never runs it, and the control plane never sends one.
type AgentUpdate struct {
	Agent     string   `json:"agent"`
	Name      string   `json:"name"`
	Installed string   `json:"installed,omitempty"`
	Latest    string   `json:"latest"`
	Command   []string `json:"command,omitempty"`
	Note      string   `json:"note,omitempty"`
}

// agentUpdates holds what the startup check found.
type agentUpdates struct {
	mu      sync.Mutex
	checked bool
	list    []AgentUpdate
}

func (u *agentUpdates) set(sts []agentupdate.Status) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.checked = true
	u.list = u.list[:0]
	for _, s := range agentupdate.Outdated(sts) {
		u.list = append(u.list, AgentUpdate{Agent: s.Agent.ID, Name: s.Agent.Name, Installed: s.Installed, Latest: s.Latest,
			Command: s.Command, Note: clipTo(s.Note, 300)})
	}
}

// report is what the next claim carries: nil until the startup check has finished, so the control
// plane keeps what it had; the list (possibly empty) once it has.
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
