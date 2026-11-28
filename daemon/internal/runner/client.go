package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/wire"
)

// ErrNoWork means the control plane had nothing to hand out (HTTP 204).
var ErrNoWork = errors.New("no work")

// Client talks to the control plane runner API. The token is sent only in the Authorization
// header and is never formatted into an error or a log line.
type Client struct {
	base string
	http *http.Client

	mu    sync.Mutex
	token string
	// tokenFile, when set, is where the token came from. The control plane writes a new token there
	// each time it starts, so a 401 re-reads it once: a daemon that outlives a control-plane restart
	// keeps working instead of being refused forever.
	tokenFile string
}

// NewClient returns a client for the control plane at base.
func NewClient(base, token string) *Client {
	return &Client{base: strings.TrimRight(base, "/"), token: token, http: &http.Client{}}
}

// WithTokenFile makes the client re-read its token from path when the control plane refuses it.
func (c *Client) WithTokenFile(path string) *Client {
	c.tokenFile = path
	return c
}

func (c *Client) currentToken() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.token
}

// reloadToken re-reads the token file; true when it holds a different, non-empty token.
func (c *Client) reloadToken() bool {
	if c.tokenFile == "" {
		return false
	}
	b, err := os.ReadFile(c.tokenFile)
	if err != nil {
		return false
	}
	t := strings.TrimSpace(string(b))
	c.mu.Lock()
	defer c.mu.Unlock()
	if t == "" || t == c.token {
		return false
	}
	c.token = t
	return true
}

func (c *Client) post(ctx context.Context, path string, body any, timeout time.Duration) (*http.Response, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", path, err)
	}
	resp, err := c.send(ctx, path, buf, timeout)
	if err == nil && resp.StatusCode == http.StatusUnauthorized && c.reloadToken() {
		_ = resp.Body.Close()
		return c.send(ctx, path, buf, timeout)
	}
	return resp, err
}

func (c *Client) send(ctx context.Context, path string, buf []byte, timeout time.Duration) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+path, bytes.NewReader(buf))
	if err != nil {
		cancel()
		return nil, fmt.Errorf("request %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.currentToken())
	resp, err := c.http.Do(req)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("POST %s: %w", path, err)
	}
	resp.Body = &cancelOnClose{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}

type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c *cancelOnClose) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()
	return err
}

func statusError(path string, resp *http.Response) error {
	msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("POST %s: HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(msg)))
}

// ClaimProtocol is the version of the claim exchange this daemon speaks: the Job it can read. The
// control plane refuses a claim from a daemon whose version is older than the jobs it hands out, so
// an API ahead of the daemon is explained rather than every run stalling (review DMN-4). It goes up
// with the control plane's CLAIM_PROTOCOL (services/api/src/work.ts).
const ClaimProtocol = 1

// UndecodableJobError is a job the control plane handed out that this daemon could not read. RunID
// and ClaimToken are set when they could still be read, so the run can be failed with the reason at
// once instead of waiting for its lease to lapse.
type UndecodableJobError struct {
	RunID, ClaimToken string
	Err               error
}

func (e *UndecodableJobError) Error() string { return "decode job: " + e.Err.Error() }
func (e *UndecodableJobError) Unwrap() error { return e.Err }

// OutdatedError is the control plane's refusal of a claim from a daemon older than it: its message
// says what to do.
type OutdatedError struct{ Message string }

func (e *OutdatedError) Error() string { return e.Message }

// ClaimRequest is the body of POST /runner/claim: the runtimes ready for work, the probe result
// for every runtime found, and the longest a run lasts in this daemon (its timeout plus the graceful
// stop ladder), from which the control plane sizes budget reservations.
type ClaimRequest struct {
	// ClaimProtocol is the claim exchange version this daemon speaks.
	ClaimProtocol      int                 `json:"claim_protocol"`
	SupportsCheckouts  bool                `json:"supports_checkouts"`
	Runtimes           []string            `json:"runtimes"`
	RuntimeStatus      []RuntimeStatus     `json:"runtime_status,omitempty"`
	RunCeilingSeconds  int                 `json:"run_ceiling_seconds,omitempty"`
	SubscriptionReport *SubscriptionReport `json:"subscription_report,omitempty"`
	// UsageLimits is what each CLI reports about its subscription windows. It never holds a token.
	UsageLimits *UsageLimitsReport `json:"usage_limits,omitempty"`
	// AgentUpdates is nil until the startup update check finishes; then always sent, even empty.
	AgentUpdates *[]AgentUpdate `json:"agent_updates,omitempty"`
	// AgentUpdatesUnchecked names, with AgentUpdates, the agents whose check could not finish.
	AgentUpdatesUnchecked []UncheckedAgent `json:"agent_updates_unchecked,omitempty"`
}

// Claim asks for one job, offering only ready runtimes. It returns ErrNoWork on HTTP 204. The
// ceiling is rounded up to a whole second, so a reservation sized from it is never short.
func (c *Client) Claim(ctx context.Context, runtimes []string, status []RuntimeStatus, runCeiling time.Duration, report *SubscriptionReport, updates ...AgentReport) (*Job, error) {
	return c.ClaimWithUsage(ctx, runtimes, status, runCeiling, report, nil, updates...)
}

// ClaimWithUsage is Claim with the usage-limits report attached.
func (c *Client) ClaimWithUsage(ctx context.Context, runtimes []string, status []RuntimeStatus, runCeiling time.Duration, report *SubscriptionReport, usage *UsageLimitsReport, updates ...AgentReport) (*Job, error) {
	if runtimes == nil {
		runtimes = []string{}
	}
	req := ClaimRequest{ClaimProtocol: ClaimProtocol, SupportsCheckouts: checkoutCustodySupported(), Runtimes: runtimes, RuntimeStatus: status, RunCeilingSeconds: int((runCeiling + time.Second - 1) / time.Second), SubscriptionReport: report, UsageLimits: usage}
	if len(updates) > 0 {
		list := append([]AgentUpdate{}, updates[0].List...)
		req.AgentUpdates = &list
		req.AgentUpdatesUnchecked = updates[0].Unchecked
	}
	resp, err := c.post(ctx, "/runner/claim", req, 30*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusNoContent:
		return nil, ErrNoWork
	case http.StatusOK, http.StatusCreated:
		const limit = 150 << 20
		raw, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
		if err != nil {
			return nil, fmt.Errorf("read job: %w", err)
		}
		var job Job
		if err := wire.Decode(bytes.NewReader(raw), "Job.json", limit, &job); err != nil {
			// The run was handed to this daemon: say which, when it can still be read, so it fails
			// with this reason now.
			var ids struct {
				Run struct {
					ID string `json:"id"`
				} `json:"run"`
				Claim struct {
					Token string `json:"token"`
				} `json:"claim"`
			}
			_ = json.Unmarshal(raw, &ids)
			return nil, &UndecodableJobError{RunID: ids.Run.ID, ClaimToken: ids.Claim.Token, Err: err}
		}
		return &job, nil
	case http.StatusConflict:
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var r struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		if json.Unmarshal(msg, &r) == nil && r.Code == "daemon-outdated" && r.Message != "" {
			return nil, &OutdatedError{Message: r.Message}
		}
		return nil, fmt.Errorf("POST /runner/claim: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	default:
		return nil, statusError("/runner/claim", resp)
	}
}

// ErrRunGone means the control plane no longer holds this run as running for this daemon (it
// was marked lost, stopped or completed). The daemon ends the agent process.
var ErrRunGone = errors.New("run is no longer held by this daemon")

// RefusedError is a completion the control plane refused for good. Retrying cannot help.
type RefusedError struct {
	Status int
	Body   string
}

func (e *RefusedError) Error() string {
	return fmt.Sprintf("completion refused: HTTP %d: %s", e.Status, e.Body)
}

// Log sends a batch of raw log lines and the daemon's own label. It is also the heartbeat that
// renews the run's lease.
func (c *Client) Log(ctx context.Context, runID string, batch LogBatch) (LogReply, error) {
	path := "/runner/runs/" + runID + "/log"
	resp, err := c.post(ctx, path, batch, 30*time.Second)
	if err != nil {
		return LogReply{}, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode/100 == 2:
		var r LogReply
		if err := wire.Decode(resp.Body, "LogReply.json", 1<<16, &r); err != nil {
			return LogReply{}, fmt.Errorf("decode log reply: %w", err)
		}
		return r, nil
	case resp.StatusCode == http.StatusConflict || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound:
		return LogReply{}, fmt.Errorf("%w: %v", ErrRunGone, statusError(path, resp))
	default:
		return LogReply{}, statusError(path, resp)
	}
}

// EvidenceReply is the control plane's answer to restart evidence.
type EvidenceReply struct {
	RunID      string `json:"run_id"`
	Reconciled bool   `json:"reconciled"`
}

// Evidence reports, after a restart, that a run's process is gone, with the receipt that proves
// which process it was. A refusal is final: the control plane no longer needs this evidence.
// EnrollSigningKey offers the daemon's public signing key (base64 of the 32 raw bytes). The
// control plane enrolls it only while the organization has no key, and answers with a status:
// enrolled, already, needs-admin, or no-organization (setup has not finished yet).
func (c *Client) EnrollSigningKey(ctx context.Context, publicKey string) (string, error) {
	const path = "/runner/signing-key"
	resp, err := c.post(ctx, path, map[string]string{"public_key": publicKey}, 30*time.Second)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", statusError(path, resp)
	}
	var r struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<12)).Decode(&r); err != nil {
		return "", fmt.Errorf("decode %s: %w", path, err)
	}
	return r.Status, nil
}

func (c *Client) Evidence(ctx context.Context, r SpawnReceipt) (EvidenceReply, error) {
	return c.EvidenceOf(ctx, r, ObservationProcessGone)
}

// What a restarted daemon observed of a run left by an earlier one.
const (
	// ObservationProcessGone: every process of the run it could see is gone.
	ObservationProcessGone = "process-gone"
	// ObservationProcessesRemain: processes of the run are still running and would not stop.
	ObservationProcessesRemain = "processes-remain"
)

// EvidenceOf is Evidence with the observation named.
func (c *Client) EvidenceOf(ctx context.Context, r SpawnReceipt, observation string) (EvidenceReply, error) {
	path := "/runner/runs/" + r.RunID + "/evidence"
	body := map[string]any{"claim_token": r.ClaimToken, "receipt": r.Wire(), "observation": observation}
	resp, err := c.post(ctx, path, body, 30*time.Second)
	if err != nil {
		return EvidenceReply{}, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode/100 == 2:
		var e EvidenceReply
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&e); err != nil {
			return EvidenceReply{}, fmt.Errorf("decode evidence reply: %w", err)
		}
		return e, nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return EvidenceReply{}, statusError(path, resp)
	default:
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return EvidenceReply{}, &RefusedError{Status: resp.StatusCode, Body: strings.TrimSpace(string(msg))}
	}
}

// Complete reports the end of a run with its outputs and trace. A network error, 408, 429 or a
// server error may be retried with the same idempotency key; any other refusal is a
// *RefusedError.
func (c *Client) Complete(ctx context.Context, runID string, comp Completion) (*Receipt, error) {
	path := "/runner/runs/" + runID + "/complete"
	resp, err := c.post(ctx, path, comp, 5*time.Minute)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode/100 == 2:
		var r Receipt
		if err := wire.Decode(resp.Body, "CompletionReceipt.json", 1<<20, &r); err != nil {
			return nil, fmt.Errorf("decode receipt: %w", err)
		}
		if r.RunID != runID || r.IdempotencyKey != comp.IdempotencyKey {
			return nil, fmt.Errorf("completion receipt subject mismatch")
		}
		return &r, nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, statusError(path, resp)
	default:
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, &RefusedError{Status: resp.StatusCode, Body: strings.TrimSpace(string(msg))}
	}
}
