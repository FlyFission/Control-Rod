package runner

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/flyfission/control-rod/daemon/internal/digest"
)

// EndpointNotEnforced is the attestation label when no egress proxy proved the
// connected host. A proxy is not implemented.
const EndpointNotEnforced = "endpoint not enforced"

// ProbeNotRun is the in-run probe result until a qualified probe exists.
const ProbeNotRun = "not-run"

const attestationSchema = "0.1.0"

// ModelEntry is one pinned model. Names are the only stream strings that count
// as that model. Hosts are the vendor endpoints. A local model, or one that is
// not deciding, cannot count on Safety or Material.
type ModelEntry struct {
	ID       string   `json:"id"`
	Harness  string   `json:"harness"`
	Names    []string `json:"names"`
	Hosts    []string `json:"hosts"`
	Deciding bool     `json:"deciding"`
	Local    bool     `json:"local"`
}

// ModelRegistry is the admission list. An id that is not here is not a vendor.
type ModelRegistry struct {
	Models []ModelEntry `json:"models"`
}

//go:embed models.json
var embeddedModels []byte

// DefaultModels is the registry shipped with the daemon.
func DefaultModels() (*ModelRegistry, error) {
	var r ModelRegistry
	if err := json.Unmarshal(embeddedModels, &r); err != nil {
		return nil, fmt.Errorf("model registry: %w", err)
	}
	return &r, nil
}

func (r *ModelRegistry) entry(id string) (ModelEntry, bool) {
	if r == nil {
		return ModelEntry{}, false
	}
	for _, m := range r.Models {
		if m.ID == id {
			return m, true
		}
	}
	return ModelEntry{}, false
}

// Admit reports whether a pinned model may count for this harness and grade.
// It does not guess a vendor when the id is missing.
func (r *ModelRegistry) Admit(model, harness, grade string) (ModelEntry, error) {
	model = strings.TrimSpace(model)
	if model == "" || model == "default" || model == "any" {
		return ModelEntry{}, errors.New("the model is not registered, so the check cannot count")
	}
	e, ok := r.entry(model)
	if !ok {
		return ModelEntry{}, fmt.Errorf("model %q is not registered, so the check cannot count", model)
	}
	if e.Harness != harness {
		return ModelEntry{}, fmt.Errorf("model %q is registered for %s, not %s, so the check cannot count", model, e.Harness, harness)
	}
	if len(e.Hosts) == 0 {
		return ModelEntry{}, fmt.Errorf("model %q has no vendor host, so the check cannot count", model)
	}
	high := grade == "safety" || grade == "material"
	if e.Local && high {
		return ModelEntry{}, errors.New("a local model cannot be the deciding checker on Safety or Material")
	}
	if !e.Deciding && high {
		return ModelEntry{}, errors.New("this model is not a deciding checker on Safety or Material")
	}
	return e, nil
}

// AcceptObserved requires every stream model to be one of the entry's names,
// and requires the pinned id itself to appear. An alias or a second model is
// provenance unknown.
func (e ModelEntry) AcceptObserved(observed []string) error {
	allowed := map[string]bool{}
	for _, n := range e.Names {
		allowed[n] = true
	}
	if len(observed) == 0 {
		return errors.New("the stream named no model, so provenance is unknown and the check cannot count")
	}
	seen := false
	for _, n := range observed {
		if !allowed[n] {
			return fmt.Errorf("the stream named %q, which is outside the pinned model, so provenance is unknown and the check cannot count", n)
		}
		if n == e.ID {
			seen = true
		}
	}
	if !seen {
		return errors.New("the stream did not name the pinned model, so provenance is unknown and the check cannot count")
	}
	return nil
}

func packageGrade(pkg json.RawMessage) string {
	var body struct {
		Grade string `json:"grade"`
	}
	_ = json.Unmarshal(pkg, &body)
	return body.Grade
}

// CheckerAdmissionJob refuses a sandboxed pre-check before a process starts.
// The file name of the executable is not an input.
func CheckerAdmissionJob(job *Job, cmd *exec.Cmd, artifact *Digest) error {
	if job == nil {
		return errors.New("a counted check has no job, so it cannot count")
	}
	if cmd == nil {
		return errors.New("a counted check has no command, so it cannot count")
	}
	harness := RuntimeFor(job.Run.Runtime.Provider)
	if err := customBaseURL(cmd.Args, cmd.Env); err != nil {
		return err
	}
	if err := delegationDisabled(harness, cmd.Args); err != nil {
		return err
	}
	reg, err := DefaultModels()
	if err != nil {
		return err
	}
	model := RequestedModel(job.Run)
	if model == "" {
		model = "default"
	}
	if _, err := reg.Admit(model, harness, packageGrade(job.Package)); err != nil {
		return err
	}
	if artifact == nil || !sha256HexOK(artifact.Value) {
		return errors.New("the check has no executable digest, so it cannot count")
	}
	got, ok := HarnessForDigest(artifact.Value, job.RuntimePin)
	if !ok {
		return errors.New("the executable digest is not a registered harness, so the check cannot count")
	}
	if got != harness {
		return fmt.Errorf("the executable digest is registered as %s, so the check cannot count", got)
	}
	return nil
}

func customBaseURL(args, env []string) error {
	for _, kv := range env {
		k, _, ok := strings.Cut(kv, "=")
		if !ok {
			continue
		}
		up := strings.ToUpper(k)
		if strings.HasSuffix(up, "_BASE_URL") || up == "OLLAMA_HOST" {
			return fmt.Errorf("the check environment sets %s, so the check cannot count", k)
		}
	}
	for _, tok := range configTokens(args) {
		low := strings.ToLower(tok)
		if strings.Contains(low, "base_url") || strings.Contains(low, "baseurl") ||
			strings.Contains(low, "model_provider") || strings.Contains(low, "ollama_host") ||
			strings.Contains(low, "anthropic_base_url") || strings.Contains(low, "openai_base_url") {
			return errors.New("the effective config names a custom base URL, so the check cannot count")
		}
	}
	return nil
}

func configTokens(args []string) []string {
	var out []string
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-c", "--settings", "--config":
			if i+1 < len(args) {
				i++
				out = append(out, args[i])
			}
		default:
			if strings.HasPrefix(args[i], "-c") && len(args[i]) > 2 {
				out = append(out, args[i][2:])
			}
		}
	}
	return out
}

func delegationDisabled(harness string, args []string) error {
	if slices.Contains(args, "--fallback-model") {
		return errors.New("a counted check cannot pass --fallback-model")
	}
	a, ok := AdapterFor(harness)
	if !ok {
		return fmt.Errorf("runtime %q is not a registered harness, so the check cannot count", harness)
	}
	// Codex is the adapter whose isolation list names --ignore-user-config.
	if slices.Contains(a.Capabilities().ConfigIsolation, "--ignore-user-config") {
		if !argPair(args, "--disable", "multi_agent") {
			return errors.New("a counted check must disable multi_agent")
		}
		if !slices.Contains(args, "--ignore-user-config") {
			return errors.New("a counted check must ignore user config")
		}
	}
	return nil
}

func argPair(args []string, flag, value string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

// ObservedModelsAllowed applies the registry to the stream's model set.
func ObservedModelsAllowed(run Run, grade string, observed []string) error {
	reg, err := DefaultModels()
	if err != nil {
		return err
	}
	model := RequestedModel(run)
	if model == "" {
		model = "default"
	}
	e, err := reg.Admit(model, RuntimeFor(run.Runtime.Provider), grade)
	if err != nil {
		return err
	}
	return e.AcceptObserved(observed)
}

var (
	harnessMu       sync.Mutex
	harnessByDigest = map[string]string{}
)

// RegisterHarnessForTest binds an executable SHA-256 to a harness id.
// The binding is the digest, not a file name.
func RegisterHarnessForTest(sum, harness string) {
	harnessMu.Lock()
	harnessByDigest[sum] = harness
	harnessMu.Unlock()
}

// UnregisterHarnessForTest removes a test binding.
func UnregisterHarnessForTest(sum string) {
	harnessMu.Lock()
	delete(harnessByDigest, sum)
	harnessMu.Unlock()
}

// HarnessForDigest returns the harness registered for this executable SHA-256.
// A pin whose digest matches is that registration: the pin's runtime, not the
// path's base name. A digest with neither is unknown.
func HarnessForDigest(sum string, pin *RuntimePin) (string, bool) {
	harnessMu.Lock()
	h, ok := harnessByDigest[sum]
	harnessMu.Unlock()
	if ok {
		return h, true
	}
	if pin != nil && pin.Digest.Value == sum {
		if a, ok := AdapterFor(pin.Runtime); ok && a.SandboxRequired() {
			return a.ID(), true
		}
	}
	return "", false
}

func sha256HexOK(s string) bool {
	if len(s) != 64 {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}

// RunAttestation is the daemon's signed statement for one counted check.
// Signature and KeyID are not part of the signed payload.
type RunAttestation struct {
	SchemaVersion         string   `json:"schema_version"`
	RunID                 string   `json:"run_id"`
	Nonce                 string   `json:"nonce"`
	ArtifactDigest        Digest   `json:"artifact_digest"`
	PolicyDigest          Digest   `json:"policy_digest"`
	EffectiveConfigDigest Digest   `json:"effective_config_digest"`
	EffectiveEndpoint     string   `json:"effective_endpoint"`
	EndpointEnforcement   string   `json:"endpoint_enforcement"`
	ObservedModels        []string `json:"observed_models"`
	Platform              string   `json:"platform"`
	ProbeResult           string   `json:"probe_result"`
	WorkspaceBefore       Digest   `json:"workspace_before"`
	WorkspaceAfter        Digest   `json:"workspace_after"`
	KeyID                 string   `json:"key_id"`
	Signature             string   `json:"signature"`
}

// signedBody is the payload whose RFC 8785 SHA-256 is signed. Field names match
// the server. Signature and key id are absent.
type signedBody struct {
	SchemaVersion         string   `json:"schema_version"`
	RunID                 string   `json:"run_id"`
	Nonce                 string   `json:"nonce"`
	ArtifactDigest        Digest   `json:"artifact_digest"`
	PolicyDigest          Digest   `json:"policy_digest"`
	EffectiveConfigDigest Digest   `json:"effective_config_digest"`
	EffectiveEndpoint     string   `json:"effective_endpoint"`
	EndpointEnforcement   string   `json:"endpoint_enforcement"`
	ObservedModels        []string `json:"observed_models"`
	Platform              string   `json:"platform"`
	ProbeResult           string   `json:"probe_result"`
	WorkspaceBefore       Digest   `json:"workspace_before"`
	WorkspaceAfter        Digest   `json:"workspace_after"`
}

func (a RunAttestation) signed() signedBody {
	return signedBody{
		SchemaVersion: a.SchemaVersion, RunID: a.RunID, Nonce: a.Nonce,
		ArtifactDigest: a.ArtifactDigest, PolicyDigest: a.PolicyDigest,
		EffectiveConfigDigest: a.EffectiveConfigDigest, EffectiveEndpoint: a.EffectiveEndpoint,
		EndpointEnforcement: a.EndpointEnforcement, ObservedModels: uniqueSorted(a.ObservedModels),
		Platform: a.Platform, ProbeResult: a.ProbeResult,
		WorkspaceBefore: a.WorkspaceBefore, WorkspaceAfter: a.WorkspaceAfter,
	}
}

// AttestationHash is the 32-byte SHA-256 of the RFC 8785 form of the signed payload.
func AttestationHash(a RunAttestation) ([]byte, error) {
	raw, err := json.Marshal(a.signed())
	if err != nil {
		return nil, err
	}
	hexHash, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return nil, err
	}
	return hex.DecodeString(hexHash)
}

func uniqueSorted(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	if out == nil {
		out = []string{}
	}
	return out
}

// SignAttestation fills the signature and key id. Observed models are stored sorted.
func SignAttestation(a RunAttestation, priv ed25519.PrivateKey) (RunAttestation, error) {
	a.ObservedModels = uniqueSorted(a.ObservedModels)
	a.SchemaVersion = attestationSchema
	sum, err := AttestationHash(a)
	if err != nil {
		return RunAttestation{}, err
	}
	pub, ok := priv.Public().(ed25519.PublicKey)
	if !ok {
		return RunAttestation{}, errors.New("signing key has no Ed25519 public key")
	}
	a.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, sum))
	a.KeyID = PublicKeyID(pub)
	return a, nil
}

// VerifyAttestationSignature checks the signature and that key id matches the public key.
func VerifyAttestationSignature(a RunAttestation, pub ed25519.PublicKey) error {
	if PublicKeyID(pub) != a.KeyID {
		return errors.New("the attestation key id does not match the public key")
	}
	sig, err := base64.StdEncoding.DecodeString(a.Signature)
	if err != nil {
		return errors.New("the attestation signature is not base64")
	}
	sum, err := AttestationHash(a)
	if err != nil {
		return err
	}
	if !ed25519.Verify(pub, sum, sig) {
		return errors.New("the attestation signature does not verify")
	}
	return nil
}

// PublicKeyID is the hex SHA-256 of the raw 32-byte public key.
func PublicKeyID(pub ed25519.PublicKey) string {
	sum := sha256.Sum256(pub)
	return hex.EncodeToString(sum[:])
}

// PublicKeyBase64 is the standard base64 of the raw public key.
func PublicKeyBase64(pub ed25519.PublicKey) string {
	return base64.StdEncoding.EncodeToString(pub)
}

func newNonce() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func digestOfHex(sum string) (Digest, error) {
	if !sha256HexOK(sum) {
		return Digest{}, errors.New("a digest is not 64 hex characters")
	}
	return Digest{Algorithm: "sha256", Value: sum}, nil
}

// BuildCheckerAttestation assembles and signs the statement for a check that
// is otherwise allowed to count. The probe result is not-run until a qualified
// in-run probe exists.
func BuildCheckerAttestation(job *Job, cmd *exec.Cmd, artifact Digest, before, after string, observed []string) (RunAttestation, error) {
	if job == nil || cmd == nil {
		return RunAttestation{}, errors.New("a counted check is missing its job, so it cannot count")
	}
	if before == "" || before != after {
		return RunAttestation{}, errors.New("the workspace hashes do not match, so the check cannot count")
	}
	reg, err := DefaultModels()
	if err != nil {
		return RunAttestation{}, err
	}
	model := RequestedModel(job.Run)
	e, err := reg.Admit(model, RuntimeFor(job.Run.Runtime.Provider), packageGrade(job.Package))
	if err != nil {
		return RunAttestation{}, err
	}
	if err := e.AcceptObserved(observed); err != nil {
		return RunAttestation{}, err
	}
	if job.SandboxPolicyDigest == nil {
		return RunAttestation{}, errors.New("the check has no sandbox policy digest, so it cannot count")
	}
	policy, err := digestOfHex(job.SandboxPolicyDigest.Value)
	if err != nil || job.SandboxPolicyDigest.Algorithm != "sha256" {
		return RunAttestation{}, errors.New("the sandbox policy digest is not sha256, so the check cannot count")
	}
	cfg, err := effectiveConfigDigest(cmd.Args)
	if err != nil {
		return RunAttestation{}, err
	}
	wsBefore, err := digestOfHex(before)
	if err != nil {
		return RunAttestation{}, err
	}
	wsAfter, err := digestOfHex(after)
	if err != nil {
		return RunAttestation{}, err
	}
	if !sha256HexOK(artifact.Value) || artifact.Algorithm != "sha256" {
		return RunAttestation{}, errors.New("the executable digest is not sha256, so the check cannot count")
	}
	nonce, err := newNonce()
	if err != nil {
		return RunAttestation{}, err
	}
	body := RunAttestation{
		SchemaVersion: attestationSchema, RunID: job.Run.ID, Nonce: nonce,
		ArtifactDigest: artifact, PolicyDigest: policy, EffectiveConfigDigest: cfg,
		EffectiveEndpoint: e.Hosts[0], EndpointEnforcement: EndpointNotEnforced,
		ObservedModels: uniqueSorted(observed), Platform: runtime.GOOS, ProbeResult: ProbeNotRun,
		WorkspaceBefore: wsBefore, WorkspaceAfter: wsAfter,
	}
	priv, err := SigningKey()
	if err != nil {
		return RunAttestation{}, err
	}
	return SignAttestation(body, priv)
}

func effectiveConfigDigest(args []string) (Digest, error) {
	raw, err := json.Marshal(configMaterial(args))
	if err != nil {
		return Digest{}, err
	}
	sum, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return Digest{}, err
	}
	return Digest{Algorithm: "sha256", Value: sum}, nil
}

// configMaterial is the generated config the digest covers, in argv order:
// isolation flags, -c values, and the --settings payload. The prompt is not included.
func configMaterial(args []string) []string {
	var out []string
	flags := map[string]bool{
		"--ignore-user-config": true, "--ignore-rules": true, "--ephemeral": true,
		"--restricted": true, "--strict-mcp-config": true, "--disable-slash-commands": true,
		"--no-session-persistence": true,
	}
	for i := 0; i < len(args); i++ {
		a := args[i]
		if flags[a] {
			out = append(out, a)
			continue
		}
		if a == "--setting-sources" || a == "--disable" || a == "--disallowedTools" || a == "-c" || a == "--settings" {
			if i+1 < len(args) {
				i++
				out = append(out, a, args[i])
			}
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}
