package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/wire"
)

// ErrNoWork means the control plane had nothing to hand out (HTTP 204).
var ErrNoWork = errors.New("no work")

// Client talks to the control plane runner API. The token is sent only in the Authorization
// header and is never formatted into an error or a log line.
type Client struct {
	base  string
	token string
	http  *http.Client
}

// NewClient returns a client for the control plane at base.
func NewClient(base, token string) *Client {
	return &Client{base: strings.TrimRight(base, "/"), token: token, http: &http.Client{}}
}

func (c *Client) post(ctx context.Context, path string, body any, timeout time.Duration) (*http.Response, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", path, err)
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+path, bytes.NewReader(buf))
	if err != nil {
		cancel()
		return nil, fmt.Errorf("request %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
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

// ClaimRequest is the body of POST /runner/claim: the runtimes ready for work and the probe
// result for every runtime found.
type ClaimRequest struct {
	Runtimes      []string        `json:"runtimes"`
	RuntimeStatus []RuntimeStatus `json:"runtime_status,omitempty"`
}

// Claim asks for one job, offering only ready runtimes. It returns ErrNoWork on HTTP 204.
func (c *Client) Claim(ctx context.Context, runtimes []string, status []RuntimeStatus) (*Job, error) {
	if runtimes == nil {
		runtimes = []string{}
	}
	resp, err := c.post(ctx, "/runner/claim", ClaimRequest{Runtimes: runtimes, RuntimeStatus: status}, 30*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusNoContent:
		return nil, ErrNoWork
	case http.StatusOK, http.StatusCreated:
		var job Job
		if err := wire.Decode(resp.Body, "Job.json", 150<<20, &job); err != nil {
			return nil, fmt.Errorf("decode job: %w", err)
		}
		return &job, nil
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
func (c *Client) Evidence(ctx context.Context, r SpawnReceipt) (EvidenceReply, error) {
	path := "/runner/runs/" + r.RunID + "/evidence"
	body := map[string]any{"claim_token": r.ClaimToken, "receipt": r.Wire(), "observation": "process-gone"}
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
	case resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
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
	case resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, statusError(path, resp)
	default:
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, &RefusedError{Status: resp.StatusCode, Body: strings.TrimSpace(string(msg))}
	}
}
