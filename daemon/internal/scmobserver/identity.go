// Package scmobserver provides immutable PR identity tracking, positional batch
// polling with monotonic cursor guards, two-phase semantic-hash acknowledgement,
// check-run reduction, review planning, and controller-owned Check Run payloads.
package scmobserver

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

var (
	// ErrInvalidIdentity indicates missing or malformed immutable PR identity fields.
	ErrInvalidIdentity = errors.New("scmobserver: invalid PR identity")

	// ErrBatchMismatch indicates raw fetch results do not positionally match requests.
	ErrBatchMismatch = errors.New("scmobserver: batch result positional mismatch")

	// ErrInvalidCheckRun indicates missing required fields on a controller Check Run.
	ErrInvalidCheckRun = errors.New("scmobserver: invalid controller check run input")
)

// PRState represents the lifecycle state of a pull request.
type PRState string

const (
	StateOpen   PRState = "open"
	StateMerged PRState = "merged"
	StateClosed PRState = "closed"
)

// IsTerminal reports whether the PR state is merged or closed.
func (s PRState) IsTerminal() bool {
	norm := PRState(strings.ToLower(strings.TrimSpace(string(s))))
	return norm == StateMerged || norm == StateClosed
}

// PRIdentity uniquely identifies a pull request by immutable provider coordinates
// (Provider, Host, ProviderID), never mutable owner/repo#number.
type PRIdentity struct {
	Provider   string
	Host       string
	ProviderID string
}

// NewPRIdentity constructs a normalized, validated PRIdentity.
func NewPRIdentity(provider, host, providerID string) (PRIdentity, error) {
	id := PRIdentity{
		Provider:   strings.ToLower(strings.TrimSpace(provider)),
		Host:       strings.ToLower(strings.TrimSpace(host)),
		ProviderID: strings.TrimSpace(providerID),
	}
	if err := id.Validate(); err != nil {
		return PRIdentity{}, err
	}
	return id, nil
}

// Validate checks that Provider, Host, and ProviderID are non-empty and well-formed.
func (id PRIdentity) Validate() error {
	if id.Provider == "" || strings.ContainsAny(id.Provider, " \t\n\r/") {
		return fmt.Errorf("%w: invalid provider %q", ErrInvalidIdentity, id.Provider)
	}
	if id.Host == "" || strings.ContainsAny(id.Host, " \t\n\r/:") {
		return fmt.Errorf("%w: invalid host %q", ErrInvalidIdentity, id.Host)
	}
	if id.ProviderID == "" || strings.ContainsAny(id.ProviderID, " \t\n\r") {
		return fmt.Errorf("%w: invalid provider_id %q", ErrInvalidIdentity, id.ProviderID)
	}
	return nil
}

// Normalized returns a copy with lowercase Provider and Host and trimmed fields.
func (id PRIdentity) Normalized() PRIdentity {
	return PRIdentity{
		Provider:   strings.ToLower(strings.TrimSpace(id.Provider)),
		Host:       strings.ToLower(strings.TrimSpace(id.Host)),
		ProviderID: strings.TrimSpace(id.ProviderID),
	}
}

// Key returns the canonical immutable key string for this PRIdentity.
func (id PRIdentity) Key() string {
	n := id.Normalized()
	return n.Provider + ":" + n.Host + ":" + n.ProviderID
}

// PRRef pairs an immutable PRIdentity with optional transport/display metadata
// (such as Repo and Number) used only for API querying and grouping.
type PRRef struct {
	Identity PRIdentity
	Repo     string
	Number   int
}

// ReviewSignal summarizes a pull request review event used for ReviewHash calculation.
type ReviewSignal struct {
	ID          string
	Author      string
	State       string
	CommitID    string
	SubmittedAt time.Time
}

// PRSnapshot captures a normalized pull request observation from a poll.
type PRSnapshot struct {
	Identity  PRIdentity
	Repo      string
	Number    int
	State     PRState
	Draft     bool
	Title     string
	BaseRef   string
	HeadRef   string
	HeadSHA   string
	Mergeable string
	Labels    []string
	Reviews   []ReviewSignal
	CheckRuns []CheckRun
	UpdatedAt time.Time
}

// SemanticHashes holds independent SHA-256 semantic digests across the three
// orthogonal SCM state dimensions.
type SemanticHashes struct {
	MetadataHash string
	CIHash       string
	ReviewHash   string
}

// ComputeSemanticHashes computes deterministic MetadataHash, CIHash, and ReviewHash
// for snap.
func ComputeSemanticHashes(snap PRSnapshot) SemanticHashes {
	return SemanticHashes{
		MetadataHash: computeMetadataHash(snap),
		CIHash:       computeCIHash(snap.HeadSHA, snap.CheckRuns),
		ReviewHash:   computeReviewHash(snap.HeadSHA, snap.Reviews),
	}
}

func computeMetadataHash(snap PRSnapshot) string {
	labels := append([]string(nil), snap.Labels...)
	slices.Sort(labels)

	h := sha256.New()
	writeLenField(h, snap.Identity.Key())
	writeLenField(h, strings.ToLower(strings.TrimSpace(string(snap.State))))
	if snap.Draft {
		writeLenField(h, "draft:true")
	} else {
		writeLenField(h, "draft:false")
	}
	writeLenField(h, snap.Title)
	writeLenField(h, snap.BaseRef)
	writeLenField(h, snap.HeadRef)
	writeLenField(h, snap.HeadSHA)
	writeLenField(h, strings.ToLower(strings.TrimSpace(snap.Mergeable)))
	for _, lbl := range labels {
		writeLenField(h, lbl)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func computeCIHash(headSHA string, runs []CheckRun) string {
	reduced := ReduceCheckRuns(headSHA, runs)
	names := make([]string, 0, len(reduced.LatestByCheck))
	for name := range reduced.LatestByCheck {
		names = append(names, name)
	}
	slices.Sort(names)

	h := sha256.New()
	writeLenField(h, headSHA)
	writeLenField(h, string(reduced.State))
	for _, name := range names {
		r := reduced.LatestByCheck[name]
		writeLenField(h, name)
		writeLenField(h, strings.ToLower(strings.TrimSpace(r.Status)))
		writeLenField(h, strings.ToLower(strings.TrimSpace(r.Conclusion)))
		writeLenField(h, r.HeadSHA)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func computeReviewHash(headSHA string, reviews []ReviewSignal) string {
	sorted := make([]ReviewSignal, len(reviews))
	copy(sorted, reviews)
	slices.SortFunc(sorted, func(a, b ReviewSignal) int {
		if a.ID != b.ID {
			return strings.Compare(a.ID, b.ID)
		}
		if !a.SubmittedAt.Equal(b.SubmittedAt) {
			if a.SubmittedAt.Before(b.SubmittedAt) {
				return -1
			}
			return 1
		}
		return strings.Compare(a.Author, b.Author)
	})

	h := sha256.New()
	writeLenField(h, headSHA)
	for _, r := range sorted {
		writeLenField(h, r.ID)
		writeLenField(h, r.Author)
		writeLenField(h, strings.ToUpper(strings.TrimSpace(r.State)))
		writeLenField(h, r.CommitID)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func writeLenField(h interface{ Write([]byte) (int, error) }, s string) {
	_, _ = fmt.Fprintf(h, "%d:%s\x00", len(s), s)
}
