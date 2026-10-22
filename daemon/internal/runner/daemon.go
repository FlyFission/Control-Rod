package runner

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	// OutboxInterval is how often completions waiting in the outbox are tried again.
	OutboxInterval time.Duration
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
	// quit ends when Run is asked to stop; completion retries stop waiting then.
	quit context.Context
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
	return &Daemon{cfg: cfg, client: NewClient(cfg.API, cfg.Token), log: cfg.Logger, outbox: NewOutbox(cfg.Home), quit: context.Background()}
}

var (
	errShutdown = errors.New("daemon shutdown")
	errLost     = errors.New("the control plane no longer holds this run for this daemon")
	errStopped  = errors.New("stopped by the owner")
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
	d.log.Info("daemon started", "api", d.cfg.API, "runtimes", strings.Join(d.cfg.Runtimes, ","), "parallel", d.cfg.Parallel)
	d.quit = ctx
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
		job, err := d.client.Claim(ctx, d.cfg.Runtimes)
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

// outboxLoop sends completions left from an earlier run at once, then retries any still
// waiting every OutboxInterval until ctx ends.
func (d *Daemon) outboxLoop(ctx context.Context) {
	t := time.NewTicker(d.cfg.OutboxInterval)
	defer t.Stop()
	for {
		d.drainOutbox(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// drainOutbox tries each waiting completion once.
func (d *Daemon) drainOutbox(ctx context.Context) {
	entries, err := d.outbox.List()
	if err != nil {
		d.log.Warn("outbox", "err", err)
	}
	for _, e := range entries {
		if ctx.Err() != nil {
			return
		}
		d.deliver(e)
	}
}

// deliver sends one completion. It returns true when the control plane recorded it or refused
// it for good; either way the entry leaves the outbox.
func (d *Daemon) deliver(e OutboxEntry) bool {
	if !d.outbox.take(e.RunID) {
		return false
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
		return true
	case errors.As(err, &refused):
		d.outbox.Refused(e.RunID)
		d.log.Error("completion refused", "run", e.RunID, "err", err)
		return true
	default:
		d.log.Warn("completion upload failed; will retry", "run", e.RunID, "err", err)
		return false
	}
}

// logBuffer collects raw lines and the latest label between flushes.
type logBuffer struct {
	mu    sync.Mutex
	lines []string
	label string
	model string
	dirty bool
}

func (b *logBuffer) add(line string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.lines = append(b.lines, line)
	if l := LabelFor(line); l != "" {
		b.label = l
	}
	if b.model == "" {
		b.model = ReportedModel(line)
	}
	b.dirty = true
}

func (b *logBuffer) reportedModel() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.model
}

func (b *logBuffer) take() (LogBatch, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.dirty {
		return LogBatch{}, false
	}
	batch := LogBatch{Lines: b.lines, Label: b.label}
	if batch.Lines == nil {
		batch.Lines = []string{}
	}
	b.lines, b.dirty = nil, false
	return batch, true
}

// flushLoop posts log batches about once a LogInterval. With nothing to send it still posts an
// empty batch every heartbeat, which renews the run's lease. If the control plane no longer holds
// the run, it ends the run through stop.
func (d *Daemon) flushLoop(ctx context.Context, job *Job, buf *logBuffer, stop context.CancelCauseFunc) {
	t := time.NewTicker(d.cfg.LogInterval)
	defer t.Stop()
	hb := time.Duration(job.Claim.HeartbeatSeconds) * time.Second
	if d.cfg.Heartbeat > 0 {
		hb = d.cfg.Heartbeat
	}
	if hb <= 0 {
		hb = 30 * time.Second
	}
	last := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			batch, ok := buf.take()
			if !ok {
				if time.Since(last) < hb {
					continue
				}
				batch = LogBatch{Lines: []string{}}
			}
			batch.ClaimToken = job.Claim.Token
			reply, err := d.client.Log(context.Background(), job.Run.ID, batch)
			switch {
			case errors.Is(err, ErrRunGone):
				d.log.Warn("run no longer held; stopping it", "run", job.Run.ID, "err", err)
				stop(errLost)
			case err != nil:
				d.log.Warn("log upload failed", "run", job.Run.ID, "err", err)
			case reply.Stop:
				last = time.Now()
				d.log.Info("owner asked to stop the run", "run", job.Run.ID)
				stop(errStopped)
			default:
				last = time.Now()
			}
		}
	}
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
	case errors.As(err, &exit):
		return fmt.Sprintf("agent exited with status %d", exit.ExitCode())
	}
	return err.Error()
}

// Handle runs one job and reports its completion. It never returns an error: every failure
// becomes a failed completion. The completion is written to the outbox first and kept there
// until the control plane confirms or refuses it.
func (d *Daemon) Handle(ctx context.Context, job *Job) {
	comp := d.Execute(ctx, job)
	comp.ClaimToken = job.Claim.Token
	comp.IdempotencyKey = newKey()
	e := OutboxEntry{RunID: job.Run.ID, Completion: comp}
	if err := d.outbox.Put(e); err != nil {
		d.log.Warn("outbox write failed; sending without it", "run", job.Run.ID, "err", err)
	}
	wait := d.cfg.RetryBase
	for attempt := 1; ; attempt++ {
		if d.deliver(e) {
			return
		}
		if attempt >= d.cfg.CompleteRetries || d.quit.Err() != nil {
			d.log.Warn("completion kept in the outbox for a later retry", "run", job.Run.ID, "attempts", attempt)
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
	started := time.Now().UTC()
	fail := func(msg string) Completion {
		return Completion{Status: "failed", Error: msg, Outputs: []NamedFile{}}
	}
	runtime := RuntimeFor(job.Run.Runtime.Provider)
	if runtime == "" || !slices.Contains(d.cfg.Runtimes, runtime) {
		return fail(fmt.Sprintf("runtime %q is not available on this machine", job.Run.Runtime.Provider))
	}
	ws, err := Prepare(d.cfg.Home, job)
	if err != nil {
		return fail(err.Error())
	}
	_, inArts, err := Collect(ws.Inputs, MaxOutputTotal, 1<<40)
	if err != nil {
		return fail("read inputs: " + err.Error())
	}
	d.log.Info("run started", "run", job.Run.ID, "role", job.Run.Role, "runtime", runtime, "workspace", ws.Dir)

	buf := &logBuffer{}
	held, release := context.WithCancelCause(ctx)
	defer release(nil)
	runCtx, cancel := context.WithTimeoutCause(held, d.cfg.Timeout, ErrTimeout)
	defer cancel()
	flushCtx, stopFlush := context.WithCancel(context.Background())
	flushed := make(chan struct{})
	go func() { d.flushLoop(flushCtx, job, buf, release); close(flushed) }()

	launch := LaunchFor(runtime, job.Run, ws)
	cmd, err := Command(runtime, job.Run, ws)
	if err == nil {
		if cmd == nil {
			buf.add(`{"type":"result","subtype":"fake-copy"}`)
			err = CopyFakeOutputs(ws)
		} else {
			err = Execute(runCtx, cmd, buf.add)
		}
	}
	stopFlush()
	<-flushed
	if batch, ok := buf.take(); ok {
		batch.ClaimToken = job.Claim.Token
		if _, lerr := d.client.Log(context.Background(), job.Run.ID, batch); lerr != nil {
			d.log.Warn("log upload failed", "run", job.Run.ID, "err", lerr)
		}
	}

	comp := Completion{Status: "succeeded", Outputs: []NamedFile{}}
	if err != nil {
		comp.Status, comp.Error = "failed", failText(err)
		if errors.Is(err, errStopped) {
			comp.Status = "stopped"
		}
	}
	files, outArts, cerr := Collect(ws.Out, MaxOutputFile, MaxOutputTotal)
	if cerr != nil {
		comp.Status, comp.Error, files, outArts = "failed", "collect outputs: "+cerr.Error(), nil, nil
	}
	if files != nil {
		comp.Outputs = files
	}
	if outArts == nil {
		outArts = []Artifact{}
	}
	if inArts == nil {
		inArts = []Artifact{}
	}
	attach := func(name string) json.RawMessage {
		b, err := os.ReadFile(filepath.Join(ws.Out, name))
		if err != nil || !json.Valid(b) {
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
		version = ToolVersion(bin)
	}
	comp.Trace = &ExecutionTrace{
		SchemaVersion:   "0.1.0",
		RunID:           job.Run.ID,
		PackageID:       job.Run.PackageID,
		PackageRevision: job.Run.PackageRevision,
		AgentBaseline:   job.Run.AgentBaseline,
		Tool:            ToolRef{Name: bin, Version: version},
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
	return comp
}
