package runner

import (
	"context"
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
	return &Daemon{cfg: cfg, client: NewClient(cfg.API, cfg.Token), log: cfg.Logger}
}

var errShutdown = errors.New("daemon shutdown")

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
	d.log.Info("daemon stopped")
	return nil
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

func (d *Daemon) flushLoop(ctx context.Context, runID string, buf *logBuffer) {
	t := time.NewTicker(d.cfg.LogInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if batch, ok := buf.take(); ok {
				if err := d.client.Log(context.Background(), runID, batch); err != nil {
					d.log.Warn("log upload failed", "run", runID, "err", err)
				}
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
	case errors.As(err, &exit):
		return fmt.Sprintf("agent exited with status %d", exit.ExitCode())
	}
	return err.Error()
}

// Handle runs one job and reports its completion. It never returns an error: every failure
// becomes a failed completion.
func (d *Daemon) Handle(ctx context.Context, job *Job) {
	comp := d.Execute(ctx, job)
	cctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := d.client.Complete(cctx, job.Run.ID, comp); err != nil {
		d.log.Error("completion upload failed", "run", job.Run.ID, "err", err)
		return
	}
	d.log.Info("run finished", "run", job.Run.ID, "role", job.Run.Role, "status", comp.Status)
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
	flushCtx, stopFlush := context.WithCancel(context.Background())
	flushed := make(chan struct{})
	go func() { d.flushLoop(flushCtx, job.Run.ID, buf); close(flushed) }()

	runCtx, cancel := context.WithTimeoutCause(ctx, d.cfg.Timeout, ErrTimeout)
	defer cancel()
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
		if lerr := d.client.Log(context.Background(), job.Run.ID, batch); lerr != nil {
			d.log.Warn("log upload failed", "run", job.Run.ID, "err", lerr)
		}
	}

	comp := Completion{Status: "succeeded", Outputs: []NamedFile{}}
	if err != nil {
		comp.Status, comp.Error = "failed", failText(err)
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
