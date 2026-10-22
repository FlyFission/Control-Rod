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

// RunClaim is the daemon's custody of one run: a token to present on every log and completion,
// and a lease that each log post renews.
type RunClaim struct {
	Token            string `json:"token"`
	LeaseExpiresAt   string `json:"lease_expires_at"`
	HeartbeatSeconds int    `json:"heartbeat_seconds"`
}

// Job is what the control plane hands the daemon from POST /runner/claim.
type Job struct {
	Run      Run             `json:"run"`
	Package  json.RawMessage `json:"package,omitempty"`
	Capture  json.RawMessage `json:"capture,omitempty"`
	Inputs   []NamedFile     `json:"inputs"`
	Findings json.RawMessage `json:"findings,omitempty"`
	Claim    RunClaim        `json:"claim"`
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
	RuntimeMode      string     `json:"runtime_mode,omitempty"`
	RequestedModel   string     `json:"requested_model,omitempty"`
	ReportedModel    string     `json:"reported_model,omitempty"`
	PermissionMode   string     `json:"permission_mode,omitempty"`
	AllowedTools     []string   `json:"allowed_tools,omitempty"`
	Sandbox          string     `json:"sandbox,omitempty"`
}

// Completion is the body of POST /runner/runs/{id}/complete.
type Completion struct {
	ClaimToken     string          `json:"claim_token"`
	IdempotencyKey string          `json:"idempotency_key"`
	Status         string          `json:"status"`
	Error          string          `json:"error,omitempty"`
	Trace          *ExecutionTrace `json:"trace,omitempty"`
	Outputs        []NamedFile     `json:"outputs"`
	Package        json.RawMessage `json:"package,omitempty"`
	Verification   json.RawMessage `json:"verification,omitempty"`
}

// LogBatch is the body of POST /runner/runs/{id}/log.
type LogBatch struct {
	ClaimToken string   `json:"claim_token"`
	Lines      []string `json:"lines"`
	Label      string   `json:"label,omitempty"`
}

// LogReply is the control plane's answer to a log post.
type LogReply struct {
	Stop           bool   `json:"stop"`
	LeaseExpiresAt string `json:"lease_expires_at"`
}

// Receipt is what the control plane recorded for a completion.
type Receipt struct {
	RunID          string `json:"run_id"`
	IdempotencyKey string `json:"idempotency_key"`
	Status         string `json:"status"`
	Refusal        *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"refusal,omitempty"`
}
