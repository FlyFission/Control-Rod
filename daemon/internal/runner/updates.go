package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"slices"
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

// runnable returns the daemon's own command for an agent, only when the version an administrator
// signed for is still the version that command installs; nil otherwise.
func (u *agentUpdates) runnable(agent, version string) []string {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, a := range u.list {
		if a.Agent == agent && a.Latest == version && len(a.Command) > 0 {
			return append([]string(nil), a.Command...)
		}
	}
	return nil
}

// merge replaces what a check of only these agents found, keeping the rest of the list.
func (u *agentUpdates) merge(ids []string, sts []agentupdate.Status) {
	u.mu.Lock()
	keep := u.list[:0:0]
	for _, a := range u.list {
		if !slices.Contains(ids, a.Agent) {
			keep = append(keep, a)
		}
	}
	u.list = keep
	u.mu.Unlock()
	fresh := agentUpdates{}
	fresh.set(sts)
	u.mu.Lock()
	defer u.mu.Unlock()
	u.checked = true
	u.list = append(u.list, fresh.list...)
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
	sts := d.cfg.UpdateCheck(c, nil)
	d.updates.set(sts)
	if msg := agentupdate.Summary(sts); msg != "" {
		d.log.Info(msg + " An administrator can also update from the app.")
	}
}

// AgentUpdateRequest is one administrator's signed request: an agent and the version they saw.
type AgentUpdateRequest struct {
	Agent   string `json:"agent"`
	Version string `json:"version"`
}

// updateIdle reports whether nothing could be using an agent CLI: no job claimed and not yet
// finished (counted in the claim loop before its goroutine starts, so a job never slips in between),
// no active run, no spawn receipt (kept while a run's processes are not confirmed stopped), and no
// run whose stop was unconfirmed without a receipt (see holdIfUnconfirmed).
func (d *Daemon) updateIdle() bool {
	if d.inFlight.Load() > 0 || d.activeCount() > 0 || d.unconfirmedBusy() {
		return false
	}
	// Any receipt file counts, readable or not: List skips an unreadable one.
	entries, err := os.ReadDir(d.receipts.dir)
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	if err != nil {
		return false
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			return false
		}
	}
	return true
}

// takeAgentUpdates asks the control plane which updates an administrator requested and runs them,
// one at a time, only while idle. It is called from the claim loop, which claims nothing while it
// runs. The daemon runs only its own command, and only for the version that was signed for.
func (d *Daemon) takeAgentUpdates(ctx context.Context) {
	if d.cfg.UpdateCheck == nil || !d.updates.any() || !d.updateIdle() {
		return
	}
	reqs, err := d.client.TakeAgentUpdates(ctx)
	if err != nil {
		d.log.Warn("agent update requests could not be read", "err", err)
		return
	}
	// ran lists each agent whose command ran, finished or failed: either may have changed its files.
	var ran []string
	for _, r := range reqs {
		// Checked again just before installing: someone may have updated it by hand since the last
		// check, and an older target must never replace a newer CLI.
		cc, ccancel := context.WithTimeout(ctx, agentupdate.CheckTimeout)
		d.updates.merge([]string{r.Agent}, d.cfg.UpdateCheck(cc, []string{r.Agent}))
		ccancel()
		argv := d.updates.runnable(r.Agent, r.Version)
		if argv == nil {
			d.updates.record(r.Agent, "failed", "the version signed for is not newer than the installed one, or not the one this daemon would install now; check again and sign the version shown", time.Now())
			continue
		}
		d.log.Info("updating an agent CLI at an administrator's request", "agent", r.Agent, "command", strings.Join(argv, " "))
		c, cancel := context.WithTimeout(ctx, UpdateTimeout)
		out, err := d.cfg.UpdateRun(c, argv[0], argv[1:])
		cancel()
		ran = append(ran, r.Agent)
		if err != nil {
			d.log.Warn("agent update failed", "agent", r.Agent, "err", err)
			d.updates.record(r.Agent, "failed", fmt.Sprintf("%v: %s", err, lastLine(out)), time.Now())
			continue
		}
		d.updates.record(r.Agent, "done", lastLine(out), time.Now())
	}
	if len(ran) > 0 {
		// Only the runtimes just touched are probed (and preflighted) again, before any run can
		// launch them, and only they are checked again.
		d.probeSome(ctx, ran)
		c, cancel := context.WithTimeout(ctx, agentupdate.CheckTimeout)
		d.updates.merge(ran, d.cfg.UpdateCheck(c, ran))
		cancel()
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

// TakeAgentUpdates returns, once each, the updates an administrator asked for.
func (c *Client) TakeAgentUpdates(ctx context.Context) ([]AgentUpdateRequest, error) {
	resp, err := c.post(ctx, "/runner/agent-updates/take", struct{}{}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, statusError("/runner/agent-updates/take", resp)
	}
	var body struct {
		Requests []AgentUpdateRequest `json:"requests"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<16)).Decode(&body); err != nil {
		return nil, err
	}
	return body.Requests, nil
}

// holdIfUnconfirmed wraps a Started hook: when it fails with the run's containment in hand (the
// receipt write or the identity confirm failed, so Execute will stop the run and may not confirm
// it), that containment is kept so an agent update waits until the run's processes are gone.
func (d *Daemon) holdIfUnconfirmed(runID string, started func(int) (*SpawnReceipt, error)) func(int) (*SpawnReceipt, error) {
	return func(pid int) (*SpawnReceipt, error) {
		r, err := started(pid)
		if err != nil && r != nil {
			d.activeMu.Lock()
			if d.unconfirmed == nil {
				d.unconfirmed = map[string]SpawnReceipt{}
			}
			d.unconfirmed[runID] = *r
			d.activeMu.Unlock()
		}
		return r, err
	}
}

// noteUncontained is called when a run ends with its stop unconfirmed. Its receipt on disk, or the
// containment holdIfUnconfirmed kept, keeps updates waiting; with neither, nothing can show when its
// processes are gone, so updates wait for a restart.
func (d *Daemon) noteUncontained(runID string) {
	d.activeMu.Lock()
	_, held := d.unconfirmed[runID]
	d.activeMu.Unlock()
	if held {
		return
	}
	if _, err := os.Stat(d.receipts.path(runID)); err == nil {
		return
	}
	d.unknownHold.Store(true)
	d.log.Warn("agent updates wait for a daemon restart: a run's processes could not be confirmed stopped and left nothing to check them by", "run", runID)
}

// unconfirmedBusy reports whether a run whose stop was not confirmed may still have processes,
// forgetting each one confirmed gone.
func (d *Daemon) unconfirmedBusy() bool {
	if d.unknownHold.Load() {
		return true
	}
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	for id, r := range d.unconfirmed {
		if r.mayRemain() {
			return true
		}
		delete(d.unconfirmed, id)
	}
	return false
}

// startJob runs a claimed job in its own goroutine, counted in inFlight from before the goroutine
// starts until it returns, so takeAgentUpdates never sees a claimed job as idle.
func (d *Daemon) startJob(run func()) {
	d.inFlight.Add(1)
	go func() {
		defer d.inFlight.Add(-1)
		run()
	}()
}
