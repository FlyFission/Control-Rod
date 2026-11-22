package scmobserver

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// CheckRunOutput models the GitHub Check Run output section.
type CheckRunOutput struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Text    string `json:"text,omitempty"`
}

// ControllerCheckRunInput provides the controller-attested inputs for building
// a GitHub Check Run payload. Checkers never hold GitHub credentials; only the
// controller builds and publishes this payload.
type ControllerCheckRunInput struct {
	Name                  string
	PRNodeID              string
	SignedHeadSHA         string
	CurrentHeadSHA        string
	ReleaseManifestDigest string
	DecisionDigest        string
	RequestedConclusion   string
	Title                 string
	Summary               string
	Text                  string
	CompletedAt           time.Time
}

// ControllerCheckRun is the controller-owned GitHub Check Run payload bound to
// (PRNodeID, HeadSHA, ReleaseManifestDigest, DecisionDigest).
type ControllerCheckRun struct {
	Name                  string         `json:"name"`
	PRNodeID              string         `json:"pr_node_id"`
	HeadSHA               string         `json:"head_sha"`
	SignedHeadSHA         string         `json:"signed_head_sha"`
	CurrentHeadSHA        string         `json:"current_head_sha"`
	ReleaseManifestDigest string         `json:"release_manifest_digest"`
	DecisionDigest        string         `json:"decision_digest"`
	Status                string         `json:"status"`
	Conclusion            string         `json:"conclusion"`
	ExternalID            string         `json:"external_id"`
	StaleHead             bool           `json:"stale_head"`
	Output                CheckRunOutput `json:"output"`
	CompletedAt           time.Time      `json:"completed_at,omitempty"`
}

var allowedCheckConclusions = map[string]bool{
	"success":         true,
	"failure":         true,
	"neutral":         true,
	"cancelled":       true,
	"skipped":         true,
	"timed_out":       true,
	"action_required": true,
}

// BuildControllerCheckRun constructs a controller-owned GitHub Check Run payload
// bound to (PRNodeID, SignedHeadSHA, ReleaseManifestDigest, DecisionDigest).
// If CurrentHeadSHA has advanced past SignedHeadSHA, Conclusion is automatically
// set to "action_required" and StaleHead is marked true.
func BuildControllerCheckRun(in ControllerCheckRunInput) (ControllerCheckRun, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "controlrod/review"
	}
	if strings.TrimSpace(in.PRNodeID) == "" {
		return ControllerCheckRun{}, fmt.Errorf("%w: PRNodeID is required", ErrInvalidCheckRun)
	}
	if strings.TrimSpace(in.SignedHeadSHA) == "" {
		return ControllerCheckRun{}, fmt.Errorf("%w: SignedHeadSHA is required", ErrInvalidCheckRun)
	}
	if strings.TrimSpace(in.ReleaseManifestDigest) == "" {
		return ControllerCheckRun{}, fmt.Errorf("%w: ReleaseManifestDigest is required", ErrInvalidCheckRun)
	}
	if strings.TrimSpace(in.DecisionDigest) == "" {
		return ControllerCheckRun{}, fmt.Errorf("%w: DecisionDigest is required", ErrInvalidCheckRun)
	}

	currentHead := strings.TrimSpace(in.CurrentHeadSHA)
	if currentHead == "" {
		currentHead = in.SignedHeadSHA
	}

	conclusion := strings.ToLower(strings.TrimSpace(in.RequestedConclusion))
	if conclusion == "" {
		conclusion = "neutral"
	}
	if !allowedCheckConclusions[conclusion] {
		return ControllerCheckRun{}, fmt.Errorf("%w: unsupported conclusion %q", ErrInvalidCheckRun, in.RequestedConclusion)
	}

	stale := currentHead != in.SignedHeadSHA
	title := in.Title
	summary := in.Summary
	if stale {
		conclusion = "action_required"
		if title == "" {
			title = "Action required: PR head advanced past signed SHA"
		}
		summary = fmt.Sprintf(
			"Head SHA advanced from signed %s to %s; re-verification required (release=%s decision=%s).",
			in.SignedHeadSHA, currentHead, in.ReleaseManifestDigest, in.DecisionDigest,
		)
	} else {
		if title == "" {
			title = "Control Rod check: " + conclusion
		}
		if summary == "" {
			summary = fmt.Sprintf(
				"Bound to PR=%s head=%s release=%s decision=%s.",
				in.PRNodeID, in.SignedHeadSHA, in.ReleaseManifestDigest, in.DecisionDigest,
			)
		}
	}

	externalID := computeCheckRunExternalID(
		in.PRNodeID,
		in.SignedHeadSHA,
		in.ReleaseManifestDigest,
		in.DecisionDigest,
	)

	return ControllerCheckRun{
		Name:                  name,
		PRNodeID:              in.PRNodeID,
		HeadSHA:               currentHead,
		SignedHeadSHA:         in.SignedHeadSHA,
		CurrentHeadSHA:        currentHead,
		ReleaseManifestDigest: in.ReleaseManifestDigest,
		DecisionDigest:        in.DecisionDigest,
		Status:                "completed",
		Conclusion:            conclusion,
		ExternalID:            externalID,
		StaleHead:             stale,
		Output: CheckRunOutput{
			Title:   title,
			Summary: summary,
			Text:    in.Text,
		},
		CompletedAt: in.CompletedAt,
	}, nil
}

func computeCheckRunExternalID(prNodeID, headSHA, releaseDigest, decisionDigest string) string {
	h := sha256.New()
	writeLenField(h, prNodeID)
	writeLenField(h, headSHA)
	writeLenField(h, releaseDigest)
	writeLenField(h, decisionDigest)
	return hex.EncodeToString(h.Sum(nil))
}
