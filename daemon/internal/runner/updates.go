package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

// AgentUpdate is an agent CLI with a newer version, as the daemon reports it (spec
// Runner.AgentUpdate). Command is the daemon's own; the control plane never sends one.
type AgentUpdate struct {
	Agent       string              `json:"agent"`
	Name        string              `json:"name"`
	Installed   string              `json:"installed,omitempty"`
	Latest      string              `json:"latest"`
	Command     []string            `json:"command,omitempty"`
	Note        string              `json:"note,omitempty"`
	LastAttempt *AgentUpdateAttempt `json:"last_attempt,omitempty"`
}

// AgentUpdateAttempt is how the last update the daemon ran for an agent ended.
type AgentUpdateAttempt struct {
	Outcome string `json:"outcome"`
	Detail  string `json:"detail,omitempty"`
	At      string `json:"at"`
}

// UpdateTimeout bounds one package-manager command.
const UpdateTimeout = 5 * time.Minute

// agentUpdates holds what the startup check found and the outcome of updates since.
type agentUpdates struct {
	mu      sync.Mutex
	checked bool
	list    []AgentUpdate
	last    map[string]*AgentUpdateAttempt
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
// plane keeps what it had; an empty list once it has, so a finished update clears.
func (u *agentUpdates) report() []AgentUpdate {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !u.checked {
		return nil
	}
	out := make([]AgentUpdate, 0, len(u.list)+len(u.last))
	seen := map[string]bool{}
	for _, a := range u.list {
		a.LastAttempt = u.last[a.Agent]
		out = append(out, a)
		seen[a.Agent] = true
	}
	// A failed attempt stays visible even if a re-check could not list the agent again.
	for id, at := range u.last {
		if !seen[id] && at.Outcome == "failed" {
			out = append(out, AgentUpdate{Agent: id, Name: id, Latest: "unknown", LastAttempt: at})
		}
	}
	return out
}

// runnable returns the daemon's own command for an agent, or nil.
func (u *agentUpdates) runnable(agent string) []string {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, a := range u.list {
		if a.Agent == agent && len(a.Command) > 0 {
			return append([]string(nil), a.Command...)
		}
	}
	return nil
}

func (u *agentUpdates) any() bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, a := range u.list {
		if len(a.Command) > 0 {
			return true
		}
	}
	return false
}

func (u *agentUpdates) record(agent, outcome, detail string, now time.Time) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.last == nil {
		u.last = map[string]*AgentUpdateAttempt{}
	}
	u.last[agent] = &AgentUpdateAttempt{Outcome: outcome, Detail: clipTo(detail, 300), At: now.UTC().Format(time.RFC3339)}
}

func clipTo(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// checkAgentUpdates runs the update check once and logs any agent with a newer version.
func (d *Daemon) checkAgentUpdates(ctx context.Context) {
	c, cancel := context.WithTimeout(ctx, agentupdate.CheckTimeout)
	defer cancel()
	sts := d.cfg.UpdateCheck(c)
	d.updates.set(sts)
	if msg := agentupdate.Summary(sts); msg != "" {
		d.log.Info(msg + " An administrator can also update from the app.")
	}
}

// takeAgentUpdates asks the control plane which updates an administrator requested and runs
// them, one at a time, while no run is active. The daemon runs only its own command for the
// agent; an agent it has no command for is skipped and reported failed.
func (d *Daemon) takeAgentUpdates(ctx context.Context) {
	if d.cfg.UpdateCheck == nil || !d.updates.any() || d.activeCount() > 0 {
		return
	}
	agents, err := d.client.TakeAgentUpdates(ctx)
	if err != nil {
		d.log.Warn("agent update requests could not be read", "err", err)
		return
	}
	for _, agent := range agents {
		argv := d.updates.runnable(agent)
		if argv == nil {
			d.updates.record(agent, "failed", "this daemon has no update command for it", time.Now())
			continue
		}
		d.log.Info("updating an agent CLI at an administrator's request", "agent", agent, "command", strings.Join(argv, " "))
		c, cancel := context.WithTimeout(ctx, UpdateTimeout)
		out, err := d.cfg.UpdateRun(c, argv[0], argv[1:])
		cancel()
		if err != nil {
			d.log.Warn("agent update failed", "agent", agent, "err", err)
			d.updates.record(agent, "failed", fmt.Sprintf("%v: %s", err, lastLine(out)), time.Now())
			continue
		}
		d.updates.record(agent, "done", lastLine(out), time.Now())
	}
	if len(agents) > 0 {
		// The new executables are probed (and preflighted) before any run can launch them.
		d.probe(ctx)
		d.checkAgentUpdates(ctx)
	}
}

func (d *Daemon) activeCount() int {
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	return len(d.active)
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return clipTo(lines[len(lines)-1], 300)
}

// TakeAgentUpdates returns, once each, the agents an administrator asked to update.
func (c *Client) TakeAgentUpdates(ctx context.Context) ([]string, error) {
	resp, err := c.post(ctx, "/runner/agent-updates/take", struct{}{}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, statusError("/runner/agent-updates/take", resp)
	}
	var body struct {
		Agents []string `json:"agents"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<16)).Decode(&body); err != nil {
		return nil, err
	}
	return body.Agents, nil
}
