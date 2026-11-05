package runner

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// Config is everything the daemon needs. The token is held here and in the client only.
type Config struct {
	API          string
	Token        string
	Home         string
	Parallel     int
	Timeout      time.Duration
	Grace        time.Duration
	PollInterval time.Duration
	LogInterval  time.Duration
	Runtimes     []string
	Version      string
	Logger       *slog.Logger

	// Heartbeat overrides the control plane's heartbeat interval (tests only).
	Heartbeat time.Duration
	// CompleteRetries is how many times a completion is tried before it waits in the outbox.
	CompleteRetries int
	// RetryBase is the first wait between completion attempts; it doubles up to 30 seconds.
	RetryBase time.Duration
	// OutboxInterval is how often the outbox and the orphan sweep run. A completion or evidence
	// report that keeps failing waits twice as long after each failure, up to RetryLimit.
	OutboxInterval time.Duration
	// RetryLimit caps that wait. Default 15 minutes.
	RetryLimit time.Duration
	// SettleAfter is how long a runtime may keep running after it reported the end of its turn
	// (Claude Code's final result, Codex's turn.completed or turn.failed). After it, the daemon ends
	// the run's processes and completes the run on what the runtime reported. Default 30 seconds.
	SettleAfter time.Duration
	// ProbeInterval is how often each runtime is probed again. Default 5 minutes.
	ProbeInterval time.Duration
	// Probe runs the probe commands; nil means ExecRunner.
	Probe CommandRunner
	// LookPath finds a program the way an agent CLI would (ADR 0021 preflight); nil means
	// LookPathAgent.
	LookPath func(string) (string, error)
	// CodexFeatures lists Codex's effective features for a run; nil means CodexEffectiveFeatures.
	CodexFeatures func(context.Context) (string, error)
	// ManagedCodexConfig are files where an administrator can set sandbox_mode; nil means
	// ManagedCodexConfig.
	ManagedCodexConfig []string
	// StopAfterHangup and StopGrace are the waits of the graceful stop ladder (SIGHUP, then
	// SIGTERM, then SIGKILL). Defaults 2 seconds and 10 seconds.
	StopAfterHangup time.Duration
	StopGrace       time.Duration
	// Container is how runs are contained; nil detects it (cgroup scopes where a systemd user
	// manager can start them, the process group otherwise).
	Container *Container
	// Breaker sets the runaway breaker's thresholds; nil means DefaultBreakerPolicy.
	Breaker *BreakerPolicy
}

// RunCeiling is the longest a run lasts in this daemon: its timeout, then the graceful stop ladder
// (hangup, then stop grace) that ends it.
func (d *Daemon) RunCeiling() time.Duration {
	return d.cfg.Timeout + d.cfg.StopAfterHangup + d.cfg.StopGrace
}

// Home returns CONTROLROD_HOME, or ~/.controlrod.
func Home(getenv func(string) string) (string, error) {
	if h := getenv("CONTROLROD_HOME"); h != "" {
		return h, nil
	}
	dir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("find home directory: %w", err)
	}
	return filepath.Join(dir, ".controlrod"), nil
}

// Token returns CONTROLROD_DAEMON_TOKEN, or the contents of <home>/daemon.token.
func Token(getenv func(string) string, home string) (string, error) {
	if t := strings.TrimSpace(getenv("CONTROLROD_DAEMON_TOKEN")); t != "" {
		return t, nil
	}
	b, err := os.ReadFile(filepath.Join(home, "daemon.token"))
	if err != nil {
		return "", errors.New("no daemon token: set CONTROLROD_DAEMON_TOKEN or write it to daemon.token in the Control Rod home directory")
	}
	t := strings.TrimSpace(string(b))
	if t == "" {
		return "", errors.New("daemon.token is empty")
	}
	return t, nil
}

// Daemon claims and runs jobs.
type Daemon struct {
	cfg    Config
	client *Client
	log    *slog.Logger
	outbox *Outbox
	// receipts are the spawn receipts of runs whose process exit is not yet observed.
	receipts *Receipts
	// quit ends when Run is asked to stop; completion retries stop waiting then.
	quit context.Context

	probeMu sync.Mutex
	status  []RuntimeStatus

	activeMu    sync.Mutex
	active      map[string]bool
	activeUnits map[string]bool
	container   Container
	// ns names this daemon's home in its scope names (Namespace).
	ns string
	// retry spaces out outbox deliveries and evidence reports that keep failing.
	retry *retryGate
}

// New returns a daemon for cfg, filling defaults.
func New(cfg Config) *Daemon {
	if cfg.Parallel < 1 {
		cfg.Parallel = 1
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 45 * time.Minute
	}
	if cfg.Grace <= 0 {
		cfg.Grace = 30 * time.Second
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 2 * time.Second
	}
	if cfg.LogInterval <= 0 {
		cfg.LogInterval = time.Second
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}
	if cfg.CompleteRetries < 1 {
		cfg.CompleteRetries = 6
	}
	if cfg.RetryBase <= 0 {
		cfg.RetryBase = time.Second
	}
	if cfg.OutboxInterval <= 0 {
		cfg.OutboxInterval = 30 * time.Second
	}
	if cfg.RetryLimit <= 0 {
		cfg.RetryLimit = 15 * time.Minute
	}
	if cfg.SettleAfter <= 0 {
		cfg.SettleAfter = 30 * time.Second
	}
	if cfg.ProbeInterval <= 0 {
		cfg.ProbeInterval = 5 * time.Minute
	}
	if cfg.Probe == nil {
		cfg.Probe = ExecRunner
	}
	if cfg.LookPath == nil {
		cfg.LookPath = LookPathAgent
	}
	if cfg.CodexFeatures == nil {
		cfg.CodexFeatures = CodexEffectiveFeatures
	}
	if cfg.ManagedCodexConfig == nil {
		cfg.ManagedCodexConfig = ManagedCodexConfig()
	}
	if cfg.StopAfterHangup <= 0 {
		cfg.StopAfterHangup = 2 * time.Second
	}
	if cfg.StopGrace <= 0 {
		cfg.StopGrace = 10 * time.Second
	}
	if cfg.Container == nil {
		k := DetectContainer(os.Getenv)
		cfg.Container = &k
	}
	ns := Namespace(cfg.Home)
	k := *cfg.Container
	k.NS = ns
	return &Daemon{cfg: cfg, client: NewClient(cfg.API, cfg.Token), log: cfg.Logger, outbox: NewOutbox(cfg.Home),
		receipts: NewReceipts(cfg.Home), container: k, ns: ns, quit: context.Background(),
		retry: newRetryGate(cfg.OutboxInterval, max(cfg.RetryLimit, cfg.OutboxInterval))}
}

// errBreaker is a run stopped by the breaker, with the reason.
type errBreaker struct{ reason string }

func (e errBreaker) Error() string { return "breaker: " + e.reason }

var (
	errShutdown = errors.New("daemon shutdown")
	errLost     = errors.New("the control plane no longer holds this run for this daemon")
	// errOutOfContact stops a run whose daemon could not reach the control plane for a whole lease
	// (specification 22a): the control plane may have pulled SCRAM or given the run up.
	errOutOfContact = errors.New("stopped: no contact with the control plane for a whole lease")
	errStopped      = errors.New("stopped by the owner")
	// errSettled ends a run whose runtime reported the end of its turn but did not exit within
	// SettleAfter. It is not a failure in itself: the run completes on what the runtime reported.
	errSettled = errors.New("the runtime reported the end of its turn but did not exit")
)

func sleepCtx(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

// Run claims jobs until ctx ends, then lets running jobs finish for the grace period before
// killing them. Every claimed job is reported as complete, even on shutdown.
func (d *Daemon) Run(ctx context.Context) error {
	if len(d.cfg.Runtimes) == 0 {
		return errors.New("no agent runtime found: install Claude Code or Codex")
	}
	d.log.Info("daemon started", "api", d.cfg.API, "runtimes", strings.Join(d.cfg.Runtimes, ","), "parallel", d.cfg.Parallel, "containment", d.container.Mode)
	if d.container.Mode != ContainCgroup {
		d.log.Warn("runs are contained by process group only: a process that leaves its group is not tracked. Cgroup containment needs Linux with a systemd user manager.")
	}
	d.quit = ctx
	// One daemon per home: two would each treat the other's runs as orphans.
	unlock, err := LockHome(d.cfg.Home)
	if err != nil {
		return err
	}
	defer unlock()
	d.sweepOrphans(ctx)
	d.probe(ctx)
	go d.probeLoop(ctx)
	outboxDone := make(chan struct{})
	go func() { d.outboxLoop(ctx); close(outboxDone) }()
	jobsCtx, cancelJobs := context.WithCancelCause(context.Background())
	defer cancelJobs(nil)
	slots := make(chan struct{}, d.cfg.Parallel)
	var wg sync.WaitGroup
	backoff := d.cfg.PollInterval
claim:
	for {
		select {
		case <-ctx.Done():
			break claim
		case slots <- struct{}{}:
		}
		status := d.runtimeStatus()
		claimSent := time.Now()
		job, err := d.client.Claim(ctx, ReadyRuntimes(status), status, d.RunCeiling())
		if job != nil {
			job.claimSent = claimSent
		}
		if err != nil {
			<-slots
			if ctx.Err() != nil {
				break claim
			}
			if errors.Is(err, ErrNoWork) {
				backoff = d.cfg.PollInterval
				sleepCtx(ctx, d.cfg.PollInterval)
				continue
			}
			d.log.Warn("claim failed", "err", err)
			sleepCtx(ctx, backoff)
			backoff = min(backoff*2, 30*time.Second)
			continue
		}
		backoff = d.cfg.PollInterval
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			d.Handle(jobsCtx, job)
		}()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(d.cfg.Grace):
		d.log.Warn("grace period over, stopping running jobs")
		cancelJobs(errShutdown)
		<-done
	}
	<-outboxDone
	d.drainOutbox(context.Background())
	d.log.Info("daemon stopped")
	return nil
}

// preflightedArtifact refuses a launch of an artifact other than the one the last probe found
// ready, preflight included: a pinned version installed after the probe is checked before it runs.
func (d *Daemon) preflightedArtifact(runtime string, launched Digest) error {
	for _, s := range d.runtimeStatus() {
		if s.Runtime != runtime {
			continue
		}
		if s.Ready && s.Artifact != nil && s.Artifact.Digest.Value == launched.Value {
			return nil
		}
		return fmt.Errorf("%s %s has not passed the sandbox preflight on this host yet; it is checked at the next probe before it runs", runtime, short(launched.Value))
	}
	return fmt.Errorf("%s has not been probed on this host", runtime)
}

// sandboxPaths are the paths a run's policy names on this host.
func (d *Daemon) sandboxPaths(ws *Workspace) SandboxPaths {
	home, _ := os.UserHomeDir()
	dh, err := filepath.Abs(d.cfg.Home)
	if err != nil {
		dh = d.cfg.Home
	}
	return SandboxPaths{Home: home, DaemonHome: dh, Workspace: ws.Dir, Logins: LoginLocations(os.Getenv)}
}

// preflight checks that this host can run rt under its sandbox (plan task 6.3).
func (d *Daemon) preflight(ctx context.Context, rt string) error {
	return Preflight(ctx, rt, d.cfg.Probe, d.cfg.LookPath, d.cfg.CodexFeatures, d.cfg.ManagedCodexConfig)
}

// probe checks every runtime found on PATH and logs, in one plain sentence each, any that is
// not ready or has become ready again. Only ready runtimes are offered for work.
func (d *Daemon) probe(ctx context.Context) {
	next := make([]RuntimeStatus, 0, len(d.cfg.Runtimes))
	for _, rt := range d.cfg.Runtimes {
		st := Probe(ctx, rt, d.cfg.Version, d.cfg.Probe)
		// A runtime whose sandbox this host cannot hold is not offered: the reason says what to fix.
		if st.Ready {
			if err := d.preflight(ctx, rt); err != nil {
				st.Ready, st.Reason = false, err.Error()
			}
		}
		next = append(next, st)
	}
	d.probeMu.Lock()
	prev := map[string]bool{}
	for _, s := range d.status {
		prev[s.Runtime] = s.Ready
	}
	d.status = next
	d.probeMu.Unlock()
	for _, s := range next {
		was, seen := prev[s.Runtime]
		switch {
		case !s.Ready && (!seen || was):
			d.log.Warn(s.Reason+". It is not offered for work.", "runtime", s.Runtime)
		case s.Ready && seen && !was:
			d.log.Info(s.Runtime+" is ready again and offered for work.", "runtime", s.Runtime, "version", s.Version)
		}
	}
}

// markNotReady withdraws a runtime from offers without running anything, until the next probe.
func (d *Daemon) markNotReady(runtime, reason string) {
	d.probeMu.Lock()
	defer d.probeMu.Unlock()
	for i := range d.status {
		if d.status[i].Runtime == runtime {
			d.status[i].Ready, d.status[i].Reason, d.status[i].Artifact = false, reason, nil
		}
	}
	d.log.Warn(reason+". It is not offered for work until it is probed again.", "runtime", runtime)
}

func (d *Daemon) probeLoop(ctx context.Context) {
	t := time.NewTicker(d.cfg.ProbeInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			d.probe(ctx)
		}
	}
}

// probedArtifact is the executable the last probe checked for a runtime, if any.
func (d *Daemon) probedArtifact(runtime string) *RuntimeArtifact {
	for _, s := range d.runtimeStatus() {
		if s.Runtime == runtime && s.Artifact != nil {
			a := *s.Artifact
			return &a
		}
	}
	return nil
}

// verifiedVersion is the version recorded for the artifact a run launched: the probe's, when the
// probe saw that same digest, otherwise the pin's. Empty when neither names it.
func (d *Daemon) verifiedVersion(runtime string, launched *Digest, pin *RuntimePin) string {
	if launched == nil {
		return ""
	}
	for _, s := range d.runtimeStatus() {
		if s.Runtime == runtime && s.Artifact != nil && s.Artifact.Digest.Value == launched.Value {
			return s.Version
		}
	}
	if pin != nil && pin.Digest.Value == launched.Value {
		return pin.Version
	}
	return ""
}

func (d *Daemon) runtimeStatus() []RuntimeStatus {
	d.probeMu.Lock()
	defer d.probeMu.Unlock()
	return append([]RuntimeStatus(nil), d.status...)
}

// outboxLoop sends completions left from an earlier run at once, then retries any still
// waiting every OutboxInterval until ctx ends.
func (d *Daemon) outboxLoop(ctx context.Context) {
	t := time.NewTicker(d.cfg.OutboxInterval)
	defer t.Stop()
	for {
		d.drainOutbox(ctx)
		d.sweepOrphans(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// drainOutbox tries each waiting completion that is due. One the control plane keeps failing
// waits longer after each failure (retryGate); it stays in the outbox until recorded or refused.
func (d *Daemon) drainOutbox(ctx context.Context) {
	entries, err := d.outbox.List()
	if err != nil {
		d.log.Warn("outbox", "err", err)
	}
	for _, e := range entries {
		if ctx.Err() != nil {
			return
		}
		key := "outbox:" + e.RunID
		if !d.retry.due(key, time.Now()) {
			continue
		}
		done, err := d.deliver(e)
		switch {
		case done:
			d.retry.forget(key)
		case err != nil:
			n, wait := d.retry.failed(key, time.Now())
			d.log.Warn("completion upload failed; kept in the outbox", "run", e.RunID, "attempts", n, "next try in", wait, "err", err)
		}
	}
}

// deliver sends one completion. It returns true when the control plane recorded it or refused
// it for good; either way the entry leaves the outbox. A transient failure returns its error; an
// entry another goroutine is sending returns false with no error.
func (d *Daemon) deliver(e OutboxEntry) (bool, error) {
	if !d.outbox.take(e.RunID) {
		return false, nil
	}
	defer d.outbox.release(e.RunID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	receipt, err := d.client.Complete(ctx, e.RunID, e.Completion)
	var refused *RefusedError
	switch {
	case err == nil:
		d.outbox.Remove(e.RunID)
		if receipt.Refusal != nil {
			d.log.Warn("run recorded failed: completion refused", "run", e.RunID, "code", receipt.Refusal.Code, "reason", receipt.Refusal.Message)
		} else {
			d.log.Info("run finished", "run", e.RunID, "status", receipt.Status)
		}
		return true, nil
	case errors.As(err, &refused):
		d.outbox.Refused(e.RunID)
		d.log.Error("completion refused", "run", e.RunID, "err", err)
		return true, nil
	default:
		return false, err
	}
}

// timings is the graceful stop ladder this daemon uses.
func (d *Daemon) timings() StopTimings {
	return StopTimings{AfterHangup: d.cfg.StopAfterHangup, Grace: d.cfg.StopGrace}
}

// sweepOrphans settles runs whose spawn receipts outlived the daemon that made them. A run whose
// completion is already in the outbox needs nothing more: its exit was observed. Otherwise every
// process left in the run's unit is stopped, and once the unit is empty the control plane is told
// the process is gone. Scopes named for runs that have no receipt (the daemon died between spawn
// and receipt) are ended too: the name proves they are this daemon's. Runs active now are left alone.
func (d *Daemon) sweepOrphans(ctx context.Context) {
	list, err := d.receipts.List()
	if err != nil {
		d.log.Warn("receipts", "err", err)
		return
	}
	known := map[string]bool{}
	for _, r := range list {
		known[r.Unit] = true
		if ctx.Err() != nil {
			return
		}
		if d.isActive(r.RunID) {
			continue
		}
		if d.outbox.HasDurable(r.RunID) {
			d.receipts.Remove(r.RunID)
			continue
		}
		if r.Alive() {
			d.log.Warn("stopping a run left by an earlier daemon", "run", r.RunID, "pid", r.PID, "containment", r.Containment)
			if !StopGracefully(r, d.timings(), nil) {
				d.log.Error("a run left by an earlier daemon would not stop; keeping its receipt", "run", r.RunID, "pid", r.PID)
				continue
			}
		}
		key := "evidence:" + r.RunID
		if !d.retry.due(key, time.Now()) {
			continue
		}
		reply, err := d.client.Evidence(ctx, r)
		var refused *RefusedError
		switch {
		case err == nil:
			d.log.Info("reported a run process gone after restart", "run", r.RunID, "reconciled", reply.Reconciled)
		case errors.As(err, &refused):
			d.log.Info("control plane no longer needs evidence for this run", "run", r.RunID, "err", err)
		default:
			n, wait := d.retry.failed(key, time.Now())
			d.log.Warn("could not report a run process gone; receipt kept", "run", r.RunID, "attempts", n, "next try in", wait, "err", err)
			continue
		}
		d.retry.forget(key)
		d.receipts.Remove(r.RunID)
	}
	for _, u := range d.container.OrphanScopes() {
		if known[u.Name] || d.isActiveUnit(u.Name) {
			continue
		}
		d.log.Warn("ending a run scope that has no receipt", "unit", u.Name)
		StopGracefully(SpawnReceipt{Containment: ContainCgroup, Unit: u.Name, Cgroup: u.Cgroup}, d.timings(), nil)
	}
}

func (d *Daemon) isActive(runID string) bool {
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	return d.active[runID]
}

func (d *Daemon) setActive(runID, unit string, on bool) {
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	if d.active == nil {
		d.active, d.activeUnits = map[string]bool{}, map[string]bool{}
	}
	if on {
		d.active[runID], d.activeUnits[unit] = true, true
	} else {
		delete(d.active, runID)
		delete(d.activeUnits, unit)
	}
}

func (d *Daemon) isActiveUnit(unit string) bool {
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	return d.activeUnits[unit]
}

// logBuffer collects raw lines, normalized events and the latest label between flushes, and the
// spawn receipt until the control plane has recorded it. Events pass the breaker, which sees all
// of them, and then admission (bounded telemetry) on the way in.
type logBuffer struct {
	mu      sync.Mutex
	lines   []string
	events  []Event
	label   string
	model   string
	dirty   bool
	receipt *OwnershipReceipt

	// nextIdx is the index the next kept event gets (Event.idx).
	nextIdx int

	admit   *Admission
	breaker *Breaker
	// onTrip stops the run when the breaker trips; called outside the lock.
	onTrip func(reason string)
	now    func() time.Time

	// turnOver is set by the runtime's own end-of-turn report (TurnEnd), and endCh is closed then.
	turnOver, turnFailed bool
	endCh                chan struct{}
}

// ended returns a channel closed once the runtime has reported the end of its turn.
func (b *logBuffer) ended() <-chan struct{} {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.endCh == nil {
		b.endCh = make(chan struct{})
	}
	return b.endCh
}

// endedFailed reports whether the runtime's end-of-turn report said the turn failed.
func (b *logBuffer) endedFailed() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.turnFailed
}

func (b *logBuffer) clock() time.Time {
	if b.now != nil {
		return b.now()
	}
	return time.Now()
}

func (b *logBuffer) setReceipt(r OwnershipReceipt) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.receipt = &r
	b.dirty = true
}

// receiptSent forgets the receipt once a log post carrying it succeeded.
func (b *logBuffer) receiptSent(r *OwnershipReceipt) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if r != nil && b.receipt == r {
		b.receipt = nil
	}
}

func (b *logBuffer) add(line string) {
	now := b.clock()
	events := Normalize(line, now)
	b.mu.Lock()
	b.lines = append(b.lines, line)
	if l := LabelFor(line); l != "" {
		b.label = l
	}
	if b.model == "" {
		b.model = ReportedModel(line)
	}
	if !b.turnOver {
		if over, failed := TurnEnd(line); over {
			b.turnOver, b.turnFailed = true, failed
			if b.endCh == nil {
				b.endCh = make(chan struct{})
			}
			close(b.endCh)
		}
	}
	b.dirty = true
	b.mu.Unlock()
	b.addEvents(events)
}

// finalFlushWait bounds the last log uploads after a run ends.
var finalFlushWait = 10 * time.Second

// maxHeldEvents bounds unsent events while uploads fail; the oldest go first, counted.
const maxHeldEvents = 5000

// addEvents admits events, lets the breaker see them, and keeps them for the next post.
func (b *logBuffer) addEvents(events []Event) {
	if len(events) == 0 {
		return
	}
	now := b.clock()
	// The breaker sees everything the run did; admission only bounds what is kept as telemetry.
	var verdict Verdict
	if b.breaker != nil {
		verdict = b.breaker.Observe(events, now)
	}
	if b.admit != nil {
		events = b.admit.Admit(events, now)
	}
	at := now.UTC().Format(time.RFC3339Nano)
	for _, w := range verdict.Warnings {
		events = append(events, Event{Kind: EvNotice, At: at, Text: "Breaker warning: " + w})
	}
	if verdict.Trip != "" {
		events = append(events, Event{Kind: EvNotice, At: at, Text: "Breaker tripped: " + verdict.Trip + ". The run is being stopped."})
	}
	b.mu.Lock()
	for i := range events {
		events[i].idx = b.nextIdx
		b.nextIdx++
	}
	b.events = append(b.events, events...)
	// The oldest go first. The gap they leave in the indexes is how the control plane learns of
	// them: it records a dropped event in their place.
	if over := len(b.events) - maxHeldEvents; over > 0 {
		b.events = b.events[over:]
	}
	b.dirty = true
	b.mu.Unlock()
	if verdict.Trip != "" && b.onTrip != nil {
		b.onTrip(verdict.Trip)
	}
}

func (b *logBuffer) reportedModel() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.model
}

// The API records at most 500 lines per request. Keep a byte budget as well so a
// retry cannot accumulate an upload too large for the request body limit.
// MaxLogBatch is the API limit on the number of lines accepted per upload.
const MaxLogBatch = 500
const maxLogBatchBytes = 1 << 20

func (b *logBuffer) take() (LogBatch, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.dirty {
		return LogBatch{}, false
	}
	n, size := 0, 0
	for n < len(b.lines) && n < MaxLogBatch {
		// Always allow one line: Execute already limits a runtime line to 16 MiB,
		// below the API's 150 MiB body limit even after JSON escaping.
		if n > 0 && size+len(b.lines[n]) > maxLogBatchBytes {
			break
		}
		size += len(b.lines[n])
		n++
	}
	batch := LogBatch{Lines: append([]string(nil), b.lines[:n]...), Label: b.label, Receipt: b.receipt}
	// A batch carries consecutive events only, so events_from places every one of them.
	if len(b.events) > 0 {
		k := 1
		for k < len(b.events) && k < MaxEventBatch && b.events[k].idx == b.events[0].idx+k {
			k++
		}
		batch.Events = append([]Event(nil), b.events[:k]...)
		batch.EventsFrom = b.events[0].idx
		b.events = b.events[k:]
	}
	if batch.Lines == nil {
		batch.Lines = []string{}
	}
	b.lines = b.lines[n:]
	b.dirty = len(b.lines) > 0 || len(b.events) > 0 || b.receipt != nil
	if !b.dirty {
		b.lines = nil
	}
	return batch, true
}

// maxHeldLines bounds how many unsent lines the daemon keeps while uploads fail.
const maxHeldLines = 20000

// MaxEventBatch is the most events one log post carries.
const MaxEventBatch = 500

// sent records that the control plane accepted a batch.
func (b *logBuffer) sent(batch LogBatch) {
	b.receiptSent(batch.Receipt)
}

// leftEvents takes the events no post delivered, for the completion: the newest consecutive run
// of at most MaxEventBatch (the exit event is last), placed by the index of its first. Older ones
// left out show as a gap, which the control plane records as dropped.
func (b *logBuffer) leftEvents() ([]Event, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	events := b.events
	b.events = nil
	if len(events) == 0 {
		return nil, 0
	}
	start := len(events) - 1
	for start > 0 && len(events)-start < MaxEventBatch && events[start-1].idx == events[start].idx-1 {
		start--
	}
	return events[start:], events[start].idx
}

// putBackEvents returns a failed batch's events to the front of the buffer.
func (b *logBuffer) putBackEvents(events []Event) {
	if len(events) == 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events = append(append(make([]Event, 0, len(events)+len(b.events)), events...), b.events...)
	b.dirty = true
}

// putBack returns a batch whose upload failed to the front of the buffer, so it is sent again
// with the next upload. After an ambiguous failure the server may see a line twice; a missing line
// is worse. The oldest lines are dropped only past maxHeldLines.
func (b *logBuffer) putBack(lines []string) {
	if len(lines) == 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	merged := append(append(make([]string, 0, len(lines)+len(b.lines)), lines...), b.lines...)
	if len(merged) > maxHeldLines {
		merged = merged[len(merged)-maxHeldLines:]
	}
	b.lines, b.dirty = merged, true
}

// flushLoop posts log batches about once a LogInterval. With nothing to send it still posts an
// empty batch every heartbeat, which renews the run's lease. If the control plane no longer holds
// the run, it ends the run through stop.
func (d *Daemon) flushLoop(ctx context.Context, job *Job, buf *logBuffer, stop context.CancelCauseFunc, hooks *hookTail, lease *leaseClock) {
	t := time.NewTicker(d.cfg.LogInterval)
	defer t.Stop()
	hb := d.heartbeat(job)
	last := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			buf.addEvents(hooks.next(time.Now()))
			batch, ok := buf.take()
			if !ok {
				if time.Since(last) < hb {
					continue
				}
				batch = LogBatch{Lines: []string{}}
			}
			batch.ClaimToken = job.Claim.Token
			// A request cannot outlast the lease, and stopping this loop abandons one in flight (its
			// batch goes back for the final flush).
			sent := time.Now()
			end := lease.deadline()
			if !sent.Before(end) {
				buf.putBack(batch.Lines)
				buf.putBackEvents(batch.Events)
				stop(errOutOfContact)
				continue
			}
			postCtx, cancelPost := context.WithDeadline(ctx, end)
			reply, err := d.client.Log(postCtx, job.Run.ID, batch)
			cancelPost()
			switch {
			case errors.Is(err, ErrRunGone):
				d.log.Warn("run no longer held; stopping it", "run", job.Run.ID, "err", err)
				stop(errLost)
			case err != nil:
				d.log.Warn("log upload failed; keeping the lines for the next upload", "run", job.Run.ID, "err", err)
				buf.putBack(batch.Lines)
				buf.putBackEvents(batch.Events)
			case reply.Stop:
				last = time.Now()
				lease.renew(sent, reply.LeaseExpiresAt)
				buf.sent(batch)
				d.log.Info("owner asked to stop the run", "run", job.Run.ID)
				stop(errStopped)
			default:
				last = time.Now()
				lease.renew(sent, reply.LeaseExpiresAt)
				buf.sent(batch)
			}
		}
	}
}

// heartbeat is how often a run's daemon must post; the lease is three of them.
func (d *Daemon) heartbeat(job *Job) time.Duration {
	hb := time.Duration(job.Claim.HeartbeatSeconds) * time.Second
	if d.cfg.Heartbeat > 0 {
		hb = d.cfg.Heartbeat
	}
	if hb <= 0 {
		hb = 30 * time.Second
	}
	return hb
}

func failText(err error) string {
	var exit *exec.ExitError
	switch {
	case errors.Is(err, ErrTimeout):
		return "timeout"
	case errors.Is(err, errShutdown):
		return "daemon shutdown"
	case errors.Is(err, errLost):
		return "run lost: " + errLost.Error()
	case errors.Is(err, errStopped):
		return errStopped.Error()
	case errors.Is(err, errOutOfContact):
		return errOutOfContact.Error()
	case errors.Is(err, errSettled):
		// Only a failed report reaches here; a successful one completes the run normally.
		return "the runtime reported a failed result and then did not exit; the daemon ended its processes"
	case errors.As(err, new(errBreaker)):
		return err.Error()
	case errors.As(err, &exit):
		return fmt.Sprintf("agent exited with status %d", exit.ExitCode())
	}
	return err.Error()
}

// Handle runs one job and reports its completion. It never returns an error: every failure
// becomes a failed completion. The completion is written to the outbox first and kept there
// until the control plane confirms or refuses it.
func (d *Daemon) Handle(ctx context.Context, job *Job) {
	// Active until the completion is in durable custody, so an orphan sweep never reports a run this
	// daemon is still finishing.
	unit := UnitName(d.ns, job.Run.ID, job.Run.Generation)
	d.setActive(job.Run.ID, unit, true)
	defer d.setActive(job.Run.ID, unit, false)
	comp, err := d.execute(ctx, job)
	if errors.Is(err, ErrUncontained) {
		// Not over: keep the receipt and send nothing. The lease lapses, the control plane holds the
		// outcome as unknown, and the orphan sweep keeps trying until the unit is confirmed empty.
		d.log.Error("processes of the run could not be confirmed stopped; keeping its receipt and sending no completion", "run", job.Run.ID)
		return
	}
	comp.ClaimToken = job.Claim.Token
	comp.IdempotencyKey = newKey()
	e := OutboxEntry{RunID: job.Run.ID, Completion: comp}
	if err := d.outbox.Put(e); err != nil {
		d.log.Warn("outbox write failed; sending without it", "run", job.Run.ID, "err", err)
	} else {
		// The completion is now in durable custody; the spawn receipt has done its job. If the outbox
		// write failed the receipt stays, so a restart can still report the exit.
		d.receipts.Remove(job.Run.ID)
	}
	wait := d.cfg.RetryBase
	for attempt := 1; ; attempt++ {
		done, err := d.deliver(e)
		if done {
			return
		}
		if attempt >= d.cfg.CompleteRetries || d.quit.Err() != nil {
			d.log.Warn("completion kept in the outbox for a later retry", "run", job.Run.ID, "attempts", attempt, "err", err)
			return
		}
		sleepCtx(d.quit, wait)
		wait = min(wait*2, 30*time.Second)
	}
}

func newKey() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Execute runs one job and returns its completion without sending it.
func (d *Daemon) Execute(ctx context.Context, job *Job) Completion {
	comp, _ := d.execute(ctx, job)
	return comp
}

// execute runs one job. ErrUncontained means processes of the run could not be confirmed gone,
// so the completion must not be sent.
func (d *Daemon) execute(ctx context.Context, job *Job) (Completion, error) {
	started := time.Now().UTC()
	fail := func(msg string) Completion {
		return Completion{Status: "failed", Error: msg, Outputs: []NamedFile{}}
	}
	runtime := RuntimeFor(job.Run.Runtime.Provider)
	if runtime == "" || !slices.Contains(d.cfg.Runtimes, runtime) {
		return fail(fmt.Sprintf("runtime %q is not available on this machine", job.Run.Runtime.Provider)), nil
	}
	// The sandbox (ADR 0021; plan tasks 6.1 and 6.3): an agent CLI starts only under the run's
	// verified policy, on a host that can hold it, checked again now without running the CLI (its
	// login and features are checked by the scheduled probe). A failure ends the run with its
	// fix and stops the runtime being offered until the next probe; nothing starts unsandboxed.
	var sandbox *SandboxPolicy
	if runtime != RuntimeFake {
		p, perr := VerifyPolicy(*job)
		if perr != nil {
			return fail(perr.Error()), nil
		}
		if perr := PreflightHost(runtime, d.cfg.LookPath, d.cfg.ManagedCodexConfig); perr != nil {
			d.markNotReady(runtime, perr.Error())
			return fail(perr.Error()), nil
		}
		sandbox = p
	}
	// The lease runs from the claim, through preparation and launch: a watchdog stops the run when
	// it ends without a renewal.
	held, release := context.WithCancelCause(ctx)
	defer release(nil)
	sent := job.claimSent
	if sent.IsZero() {
		sent = time.Now()
	}
	lease := newLeaseClock(sent, job.Claim.LeaseExpiresAt, d.heartbeat(job))
	watchDone := make(chan struct{})
	defer close(watchDone)
	go lease.watch(watchDone, func() {
		d.log.Warn("no contact with the control plane for a whole lease; stopping the run", "run", job.Run.ID)
		release(errOutOfContact)
	})
	ws, err := Prepare(d.cfg.Home, job)
	if err != nil {
		return fail(err.Error()), nil
	}
	_, inArts, err := Collect(ws.Inputs, MaxOutputTotal, 1<<40)
	if err != nil {
		return fail("read inputs: " + err.Error()), nil
	}
	d.log.Info("run started", "run", job.Run.ID, "role", job.Run.Role, "runtime", runtime, "workspace", ws.Dir)

	policy := DefaultBreakerPolicy
	if d.cfg.Breaker != nil {
		policy = *d.cfg.Breaker
	}
	buf := &logBuffer{admit: NewAdmission(20, 200), breaker: NewBreaker(policy, time.Now()), onTrip: func(reason string) {
		d.log.Warn("breaker tripped; stopping the run", "run", job.Run.ID, "reason", reason)
		release(errBreaker{reason})
	}}
	switch runtime {
	case RuntimeClaude:
		// Interim waiting detection (plan task 2.9): the PermissionRequest hook writes here.
		hooks := filepath.Join(d.cfg.Home, "hooks")
		if err := os.MkdirAll(hooks, 0o700); err == nil {
			ws.HookFile = filepath.Join(hooks, job.Run.ID+".jsonl")
			_ = os.Remove(ws.HookFile)
			defer os.Remove(ws.HookFile)
		}
	case RuntimeCodex:
		buf.addEvents([]Event{{Kind: EvNotice, At: time.Now().UTC().Format(time.RFC3339Nano),
			Text: "Permission waits are not observable in Codex exec mode; a refused action shows as a failed tool call."}})
	}
	runCtx, cancel := context.WithTimeoutCause(held, d.cfg.Timeout, ErrTimeout)
	defer cancel()
	flushCtx, stopFlush := context.WithCancel(context.Background())
	flushed := make(chan struct{})
	hooks := &hookTail{path: ws.HookFile}
	go func() { d.flushLoop(flushCtx, job, buf, release, hooks, lease); close(flushed) }()
	// A runtime that has reported the end of its turn is done. If its process is still there after
	// SettleAfter (background work, a hung hook or child), the run's processes are ended and the run
	// completes on what the runtime reported, rather than showing as running until the timeout.
	settleCtx, stopSettle := context.WithCancel(context.Background())
	defer stopSettle()
	go func() {
		select {
		case <-buf.ended():
		case <-settleCtx.Done():
			return
		}
		t := time.NewTimer(d.cfg.SettleAfter)
		defer t.Stop()
		select {
		case <-t.C:
		case <-settleCtx.Done():
			return
		}
		release(errSettled)
	}()

	launch := LaunchFor(runtime, job.Run, ws, sandbox)
	var spawned *SpawnReceipt
	// A stop freezes the run and reads out/ into the daemon's memory while it is frozen; that
	// capture is then the run's only output, and nothing on disk is read again.
	var frozen *Captured
	var snapshotErr error
	snapshot := func() {
		c, err := Capture(ws.Out, MaxOutputFile, MaxOutputTotal)
		frozen, snapshotErr = c, err
		if err == nil && frozen == nil {
			frozen = &Captured{Raw: map[string][]byte{}}
		}
	}
	cmd, err := Command(runtime, job.Run, ws, sandbox, d.sandboxPaths(ws))
	// Nothing starts once the lease has ended (or anything else stopped the run) during preparation.
	if err == nil && held.Err() != nil {
		err = context.Cause(held)
	}
	var launched *Digest
	var verified *VerifiedLaunch
	if err == nil && cmd != nil && runtime != RuntimeFake {
		// Launch by digest (specification 21): the exact file the pin (or, unpinned, the last probe)
		// names, checked again now and executed from the descriptor whose bytes were hashed.
		v, verr := VerifyLaunch(runtime, job.RuntimePin, d.probedArtifact(runtime))
		if verr != nil {
			err = verr
			if job.RuntimePin == nil {
				// Not offered again until the next scheduled probe requalifies it; nothing runs now.
				d.markNotReady(runtime, verr.Error())
			}
		} else if qerr := d.preflightedArtifact(runtime, v.Digest); qerr != nil {
			// The sandbox preflight (login, Codex features) passed for a different artifact, or for
			// none: the launched one has not been checked on this host.
			v.Close()
			err = qerr
		} else {
			// The child inherits the open descriptor; the daemon's copy closes once the run ends.
			verified = v
			defer verified.Close()
			verified.Apply(cmd)
			launched = &verified.Digest
		}
	}
	if err == nil {
		if cmd == nil {
			buf.add(`{"type":"result","subtype":"fake-copy"}`)
			err = CopyFakeOutputs(ws)
		} else {
			unit := UnitName(d.ns, job.Run.ID, job.Run.Generation)
			d.container.Wrap(cmd, unit)
			err = Execute(runCtx, cmd, buf.add, ExecHooks{
				Timings:  d.timings(),
				Snapshot: snapshot,
				// At the moment of the start: the run must still be wanted, its lease must not have
				// ended, and the runtime's guard must still hold.
				BeforeStart: func() error {
					// runCtx carries the timeout as well as every stop.
					if runCtx.Err() != nil {
						return context.Cause(runCtx)
					}
					if !time.Now().Before(lease.deadline()) {
						return errOutOfContact
					}
					return verified.Ready()
				},
				Started: func(pid int) (*SpawnReceipt, error) {
					u, lerr := d.container.Locate(pid, unit)
					if lerr != nil {
						// Not seen in its scope: end whatever the scope holds, by name.
						return &SpawnReceipt{Containment: d.container.Mode, Unit: unit, PGID: pid,
							Cgroup: filepath.Join(d.container.ScopeParent, unit+".scope")}, lerr
					}
					r, rerr := NewReceipt(job.Run.ID, job.Claim.Token, pid, max(job.Run.Generation, 1), u)
					if errors.Is(rerr, ErrNoIdentity) {
						d.log.Warn("no process identity on this platform; the run can only be stopped by this daemon", "run", job.Run.ID)
						return nil, nil
					}
					if rerr != nil {
						return &SpawnReceipt{Containment: u.Mode, Unit: u.Name, Cgroup: u.Cgroup, PGID: pid}, rerr
					}
					// Fail closed: a run whose receipt is not durable could outlive this daemon unowned,
					// so the whole located unit is stopped.
					if perr := d.receipts.Put(r); perr != nil {
						return &r, perr
					}
					// Fail closed: a run not proven to execute the verified bytes is stopped whole.
					if cerr := verified.Confirm(pid); cerr != nil {
						return &r, cerr
					}
					buf.setReceipt(r.Wire())
					spawned = &r
					return &r, nil
				}})
		}
	}
	// The process is gone: nothing can settle it any more.
	stopSettle()
	// Said only when the settle is what ended the run, not when the process exited at the same moment.
	settled := errors.Is(err, errSettled)
	if settled {
		d.log.Warn("runtime did not exit after reporting the end of its turn; its processes were ended", "run", job.Run.ID, "after", d.cfg.SettleAfter)
		buf.addEvents([]Event{{Kind: EvNotice, At: time.Now().UTC().Format(time.RFC3339Nano),
			Text: fmt.Sprintf("The runtime reported the end of its turn but did not exit within %s; the daemon ended its processes.", d.cfg.SettleAfter)}})
		if !buf.endedFailed() {
			err = nil
		}
	}
	stopFlush()
	<-flushed
	// The flush loop has stopped; finish reading the hook file from where it left off.
	buf.addEvents(hooks.next(time.Now()))
	exit := Event{Kind: EvExit, At: time.Now().UTC().Format(time.RFC3339Nano), Text: "exited"}
	if settled {
		exit.Text = "ended by the daemon after the end of its turn"
	}
	if err != nil {
		exit.Text = failText(err)
	}
	buf.addEvents([]Event{exit})
	// The final flush is bounded: an unresponsive control plane must not hold the completion back,
	// and whatever is not delivered goes with it.
	finalCtx, cancelFinal := context.WithTimeout(context.Background(), finalFlushWait)
	defer cancelFinal()
	for {
		batch, ok := buf.take()
		if !ok {
			break
		}
		batch.ClaimToken = job.Claim.Token
		if _, lerr := d.client.Log(finalCtx, job.Run.ID, batch); lerr != nil {
			buf.putBack(batch.Lines)
			buf.putBackEvents(batch.Events)
			d.log.Warn("log upload failed; its events go with the completion", "run", job.Run.ID, "err", lerr)
			break
		}
		buf.sent(batch)
	}
	leftover, leftFrom := buf.leftEvents()
	if errors.Is(err, ErrUncontained) {
		return Completion{}, ErrUncontained
	}

	comp := Completion{Status: "succeeded", Outputs: []NamedFile{}, Events: leftover}
	if len(leftover) > 0 {
		comp.EventsFrom = leftFrom
	}
	switch {
	case cmd == nil:
		comp.Containment = "none"
	case spawned != nil:
		w := spawned.Wire()
		comp.Receipt, comp.Containment = &w, spawned.Containment
	}
	if err != nil {
		comp.Status, comp.Error = "failed", failText(err)
		if errors.Is(err, errStopped) {
			comp.Status = "stopped"
		}
	}
	// After a stop, the capture taken while frozen is the run's only output.
	if snapshotErr != nil {
		comp.Status, comp.Error = "failed", "outputs could not be snapshot when the run was stopped: "+snapshotErr.Error()
	}
	captured := frozen
	if captured == nil && snapshotErr == nil {
		c, cerr := Capture(ws.Out, MaxOutputFile, MaxOutputTotal)
		if cerr != nil {
			comp.Status, comp.Error = "failed", "collect outputs: "+cerr.Error()
		}
		captured = c
	}
	var outArts []Artifact
	if captured != nil {
		if captured.Files != nil {
			comp.Outputs = captured.Files
		}
		outArts = captured.Arts
	}
	if outArts == nil {
		outArts = []Artifact{}
	}
	if inArts == nil {
		inArts = []Artifact{}
	}
	attach := func(name string) json.RawMessage {
		if captured == nil {
			return nil
		}
		b, ok := captured.Raw[name]
		if !ok || !json.Valid(b) {
			return nil
		}
		return b
	}
	switch job.Run.Role {
	case "intake":
		comp.Package = attach("package.json")
	case "pre-check":
		comp.Verification = attach("verification.json")
	}
	bin, version := runtime, ""
	if runtime == RuntimeFake {
		version = d.cfg.Version
	} else {
		// Never run the executable again for its version: it may no longer be what was verified.
		version = d.verifiedVersion(runtime, launched, job.RuntimePin)
	}
	comp.Trace = &ExecutionTrace{
		SchemaVersion:   "0.1.0",
		RunID:           job.Run.ID,
		PackageID:       job.Run.PackageID,
		PackageRevision: job.Run.PackageRevision,
		AgentBaseline:   job.Run.AgentBaseline,
		Tool:            ToolRef{Name: bin, Version: version, Digest: launched},
		Inputs:          inArts,
		Outputs:         outArts,
		StartedAt:       started.Format(time.RFC3339),
		FinishedAt:      time.Now().UTC().Format(time.RFC3339),
		RuntimeMode:     launch.Mode,
		RequestedModel:  launch.RequestedModel,
		ReportedModel:   buf.reportedModel(),
		PermissionMode:  launch.PermissionMode,
		AllowedTools:    launch.AllowedTools,
		Sandbox:         launch.Sandbox,
	}
	return comp, nil
}

// maxHookRead bounds one read of the permission hook file, and so the size of one record.
const maxHookRead = 1 << 20

// hookTail follows the permission hook file: the flush loop reads it while the run works and the
// final drain continues from the same place, so no request is reported twice or missed.
type hookTail struct {
	path     string
	offset   int64
	skipping bool // inside a record larger than maxHookRead, discarding to its end
}

// next returns whole lines appended since the last call, and the events they report. A partial
// last line waits for the next call. A record larger than maxHookRead is skipped to its end with a
// notice, so one oversized request cannot stop every later one from being read.
func (h *hookTail) next(now time.Time) []Event {
	if h == nil || h.path == "" {
		return nil
	}
	f, err := os.Open(h.path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []Event
	for {
		if _, err := f.Seek(h.offset, io.SeekStart); err != nil {
			return out
		}
		b, err := io.ReadAll(io.LimitReader(f, maxHookRead))
		if err != nil || len(b) == 0 {
			return out
		}
		if h.skipping {
			i := bytes.IndexByte(b, '\n')
			if i < 0 {
				h.offset += int64(len(b))
				continue
			}
			h.offset += int64(i + 1)
			h.skipping = false
			continue
		}
		end := bytes.LastIndexByte(b, '\n')
		if end < 0 {
			if len(b) < maxHookRead {
				return out // a record still being written
			}
			h.offset += int64(len(b))
			h.skipping = true
			out = append(out, Event{Kind: EvNotice, At: now.UTC().Format(time.RFC3339Nano),
				Text: "A permission request was too large to read and was skipped."})
			continue
		}
		h.offset += int64(end + 1)
		out = append(out, PermissionEvents(b[:end+1], now)...)
		if len(b) < maxHookRead {
			return out
		}
	}
}
