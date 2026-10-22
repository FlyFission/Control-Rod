// Package runner is the Control Rod run daemon: it claims jobs from the control plane, runs an
// agent runtime in a per-job workspace, streams a log, and reports outputs with an execution
// trace. It never makes a decision; the control plane and its kernel do.
package runner

import "encoding/json"

// NamedFile is a file carried in a job or a completion, base64 encoded.
type NamedFile struct {
	Name          string `json:"name"`
	ContentBase64 string `json:"content_base64"`
}

// RuntimeRef names the runtime a run must use.
type RuntimeRef struct {
	Kind     string `json:"kind"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// Run is the part of the Run record the daemon needs.
type Run struct {
	ID              string     `json:"id"`
	PackageID       string     `json:"package_id"`
	PackageRevision int        `json:"package_revision"`
	Role            string     `json:"role"`
	AgentBaseline   string     `json:"agent_baseline"`
	Runtime         RuntimeRef `json:"runtime"`
	Round           int        `json:"round"`
}

// Job is what the control plane hands the daemon from POST /runner/claim.
type Job struct {
	Run      Run             `json:"run"`
	Package  json.RawMessage `json:"package,omitempty"`
	Capture  json.RawMessage `json:"capture,omitempty"`
	Inputs   []NamedFile     `json:"inputs"`
	Findings json.RawMessage `json:"findings,omitempty"`
}

// Digest is a content digest.
type Digest struct {
	Algorithm string `json:"algorithm"`
	Value     string `json:"value"`
}

// Artifact is a file and its digest.
type Artifact struct {
	Path   string `json:"path"`
	Digest Digest `json:"digest"`
}

// ToolRef identifies the runtime binary that produced the outputs.
type ToolRef struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// ExecutionTrace is proof of where outputs came from, recorded by the daemon.
type ExecutionTrace struct {
	SchemaVersion    string     `json:"schema_version"`
	RunID            string     `json:"run_id"`
	PackageID        string     `json:"package_id"`
	PackageRevision  int        `json:"package_revision"`
	AgentBaseline    string     `json:"agent_baseline"`
	BaselineRevision int        `json:"baseline_revision"`
	Tool             ToolRef    `json:"tool"`
	Inputs           []Artifact `json:"inputs"`
	Outputs          []Artifact `json:"outputs"`
	StartedAt        string     `json:"started_at"`
	FinishedAt       string     `json:"finished_at"`
}

// Completion is the body of POST /runner/runs/{id}/complete.
type Completion struct {
	Status       string          `json:"status"`
	Error        string          `json:"error,omitempty"`
	Trace        *ExecutionTrace `json:"trace,omitempty"`
	Outputs      []NamedFile     `json:"outputs"`
	Package      json.RawMessage `json:"package,omitempty"`
	Verification json.RawMessage `json:"verification,omitempty"`
}

// LogBatch is the body of POST /runner/runs/{id}/log.
type LogBatch struct {
	Lines []string `json:"lines"`
	Label string   `json:"label,omitempty"`
}
