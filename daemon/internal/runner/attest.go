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
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strings"
	"sync"
	"unicode/utf16"

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
	if err := customBaseURL(harness, cmd.Args, cmd.Env); err != nil {
		return err
	}
	if err := delegationDisabled(harness, cmd.Args); err != nil {
		return err
	}
	if err := ephemeralOrIsolated(harness, cmd.Args, cmd.Env); err != nil {
		return err
	}
	reg, err := DefaultModels()
	if err != nil {
		return err
	}
	model, err := modelForCheck(job.Run, job.RuntimePin, harness, cmd.Args)
	if err != nil {
		return err
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

func customBaseURL(harness string, args, env []string) error {
	for _, kv := range env {
		k, _, ok := strings.Cut(kv, "=")
		if !ok {
			continue
		}
		if forbiddenEnv(k) {
			return fmt.Errorf("the check environment sets %s, so the check cannot count", k)
		}
	}
	return scanArgs(harness, args)
}

func forbiddenEnv(key string) bool {
	up := strings.ToUpper(key)
	switch up {
	case "OLLAMA_HOST", "OPENAI_API_BASE", "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_BASE_URL",
		"CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY":
		return true
	}
	return strings.HasSuffix(up, "_BASE_URL") || strings.HasSuffix(up, "_PROXY")
}

// shortAttached splits -cX, -c=X, -pX, -p=X, -mX and -m=X. An exact -c, -p or -m is not attached.
func shortAttached(a string) (name, value string, ok bool) {
	for _, flag := range []string{"-c", "-p", "-m"} {
		if a == flag || !strings.HasPrefix(a, flag) || len(a) == len(flag) {
			continue
		}
		rest := strings.TrimPrefix(a[len(flag):], "=")
		return flag, rest, true
	}
	return "", "", false
}

func codexHarness(harness string) bool {
	a, ok := AdapterFor(harness)
	return ok && slices.Contains(a.Capabilities().ConfigIsolation, "--ignore-user-config")
}

// looksLikeFlag is a following argv token that is itself a flag, not a value.
func looksLikeFlag(token string) bool {
	return len(token) > 1 && strings.HasPrefix(token, "-")
}

func valuedFlag(name string) bool {
	switch name {
	case "-c", "-m", "--settings", "--config", "--fallback-model", "--disable", "--model", "--disallowedTools", "--setting-sources":
		return true
	}
	return false
}

// walkCountedArgs visits each flag. Claude -p and --print are boolean, so the
// prompt stays out of the value scan. A valued flag refuses a following token
// that is itself a flag instead of treating it as the value.
func walkCountedArgs(harness string, args []string, fn func(name, value string) error) error {
	codex := codexHarness(harness)
	for i := 0; i < len(args); i++ {
		a := args[i]
		if n, v, attached := shortAttached(a); attached {
			if err := acceptFlag(codex, n, v, true, fn); err != nil {
				return err
			}
			continue
		}
		if k, v, inline := strings.Cut(a, "="); inline && (strings.HasPrefix(k, "--") || k == "-c" || k == "-m" || k == "-p") {
			if err := acceptFlag(codex, k, v, true, fn); err != nil {
				return err
			}
			continue
		}
		if err := acceptFlag(codex, a, "", false, fn); err != nil {
			return err
		}
		if !valuedFlag(a) || (codex && (a == "-p" || a == "--profile")) || (!codex && (a == "-p" || a == "--print")) {
			continue
		}
		if i+1 >= len(args) || looksLikeFlag(args[i+1]) {
			return fmt.Errorf("%s was given another flag as its value, so the check cannot count", a)
		}
		i++
		if err := fn(a, args[i]); err != nil {
			return err
		}
	}
	return nil
}

func acceptFlag(codex bool, name, value string, hasValue bool, fn func(name, value string) error) error {
	if name == "--fallback-model" {
		return errors.New("a counted check cannot pass --fallback-model")
	}
	if codex && (name == "-p" || name == "--profile") {
		return errors.New("a counted Codex check cannot select a profile")
	}
	// Claude -p and --print are the print switch. The prompt is not config.
	if !codex && (name == "-p" || name == "--print") {
		return nil
	}
	if !hasValue {
		if valuedFlag(name) {
			return nil
		}
		return fn(name, "")
	}
	if looksLikeFlag(value) {
		return fmt.Errorf("%s was given another flag as its value, so the check cannot count", name)
	}
	return fn(name, value)
}

func scanArgs(harness string, args []string) error {
	return walkCountedArgs(harness, args, func(name, value string) error {
		low := strings.ToLower(value)
		if strings.Contains(low, "base_url") || strings.Contains(low, "baseurl") ||
			strings.Contains(low, "model_provider") || strings.Contains(low, "ollama_host") ||
			strings.Contains(low, "openai_api_base") {
			return errors.New("the effective config names a custom base URL, so the check cannot count")
		}
		if name == "--settings" || name == "--config" {
			return inspectSettings(value)
		}
		return nil
	})
}

// argvModel is the model named by -m or --model, including -mX and --model=X.
func argvModel(harness string, args []string) (string, error) {
	var found string
	err := walkCountedArgs(harness, args, func(name, value string) error {
		if name == "-m" || name == "--model" {
			found = value
		}
		return nil
	})
	return found, err
}

func inspectSettings(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmed, "{") {
		return errors.New("a counted check cannot take settings from a file path")
	}
	var v any
	if err := json.Unmarshal([]byte(trimmed), &v); err != nil {
		return errors.New("the checker settings are not JSON, so the check cannot count")
	}
	return walkSettings("", v)
}

func walkSettings(key string, v any) error {
	lk := strings.ToLower(key)
	if lk == "apikeyhelper" || lk == "baseurl" || lk == "base_url" || strings.Contains(lk, "model_provider") {
		return fmt.Errorf("the checker settings set %s, so the check cannot count", key)
	}
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if strings.EqualFold(k, "env") {
				if env, ok := child.(map[string]any); ok {
					for ek := range env {
						if forbiddenEnv(ek) {
							return fmt.Errorf("the checker settings set env.%s, so the check cannot count", ek)
						}
					}
				}
			}
			if err := walkSettings(k, child); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range t {
			if err := walkSettings(key, child); err != nil {
				return err
			}
		}
	}
	return nil
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

// ephemeralOrIsolated: a counted Codex check records no session (--ephemeral) unless it runs with
// its own disposable CODEX_HOME, which is never the user's real login folder. A check that records
// a session in the real one cannot count.
func ephemeralOrIsolated(harness string, args, env []string) error {
	a, ok := AdapterFor(harness)
	if !ok || !slices.Contains(a.Capabilities().ConfigIsolation, "--ephemeral") || slices.Contains(args, "--ephemeral") {
		return nil
	}
	name := isolatedLoginHomeEnv(harness)
	home := ""
	for _, kv := range env {
		if k, v, ok := strings.Cut(kv, "="); ok && k == name && name != "" {
			home = v
		}
	}
	if home == "" || !filepath.IsAbs(home) {
		return errors.New("a counted check without --ephemeral needs its own disposable login home, so the check cannot count")
	}
	if u, err := os.UserHomeDir(); err == nil {
		if real, ok := a.(interface {
			LoginDir(string, func(string) string) string
		}); ok {
			if within(home, real.LoginDir(u, os.Getenv)) {
				return errors.New("a counted check without --ephemeral would record its session in the real login folder, so the check cannot count")
			}
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
// modelForCheck is the model the attestation names. An attached -mX or
// --model=X is the same model as the separate-argument form. It has to be
// the model the run resolved to.
func modelForCheck(run Run, pin *RuntimePin, harness string, args []string) (string, error) {
	fromArgs, err := argvModel(harness, args)
	if err != nil {
		return "", err
	}
	want := resolvedModel(run, pin)
	if fromArgs != "" && want != "" && fromArgs != want {
		return "", errors.New("the command names a different model than this run, so the check cannot count")
	}
	if want == "" {
		return fromArgs, nil
	}
	return want, nil
}

func resolvedModel(run Run, pin *RuntimePin) string {
	if m := RequestedModel(run); m != "" {
		return m
	}
	if pin != nil {
		m := strings.TrimSpace(pin.Model)
		if m != "" && m != "default" && m != "any" {
			return m
		}
	}
	return ""
}

func checkID(run Run) string {
	if id := strings.TrimSpace(run.AttemptID); id != "" {
		return id
	}
	return fmt.Sprintf("%s:%d", run.ID, run.PackageRevision)
}

func ObservedModelsAllowed(run Run, pin *RuntimePin, grade string, observed []string) error {
	reg, err := DefaultModels()
	if err != nil {
		return err
	}
	model := resolvedModel(run, pin)
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
	RequestedModel        string   `json:"requested_model"`
	CheckID               string   `json:"check_id"`
	DeliverableDigest     Digest   `json:"deliverable_digest"`
	VerificationDigest    Digest   `json:"verification_digest"`
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
	RequestedModel        string   `json:"requested_model"`
	CheckID               string   `json:"check_id"`
	DeliverableDigest     Digest   `json:"deliverable_digest"`
	VerificationDigest    Digest   `json:"verification_digest"`
}

func (a RunAttestation) signed() signedBody {
	return signedBody{
		SchemaVersion: a.SchemaVersion, RunID: a.RunID, Nonce: a.Nonce,
		ArtifactDigest: a.ArtifactDigest, PolicyDigest: a.PolicyDigest,
		EffectiveConfigDigest: a.EffectiveConfigDigest, EffectiveEndpoint: a.EffectiveEndpoint,
		EndpointEnforcement: a.EndpointEnforcement, ObservedModels: uniqueSorted(a.ObservedModels),
		Platform: a.Platform, ProbeResult: a.ProbeResult,
		WorkspaceBefore: a.WorkspaceBefore, WorkspaceAfter: a.WorkspaceAfter,
		RequestedModel: a.RequestedModel, CheckID: a.CheckID,
		DeliverableDigest: a.DeliverableDigest, VerificationDigest: a.VerificationDigest,
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
	sort.Slice(out, func(i, j int) bool { return utf16Less(out[i], out[j]) })
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

// BuildCheckerAttestation signs the statement using the runtime arguments as admitted,
// before any launch wrappers. The probe result is not-run until a qualified in-run probe exists.
func BuildCheckerAttestation(job *Job, admittedArgs []string, artifact Digest, deliverableRoot, before, after string, observed []string, verification, criterion json.RawMessage, evidence []Artifact) (RunAttestation, error) {
	if job == nil || len(admittedArgs) == 0 {
		return RunAttestation{}, errors.New("a counted check is missing its job or admitted command, so it cannot count")
	}
	if before == "" || before != after {
		return RunAttestation{}, errors.New("the workspace hashes do not match, so the check cannot count")
	}
	reg, err := DefaultModels()
	if err != nil {
		return RunAttestation{}, err
	}
	model, err := modelForCheck(job.Run, job.RuntimePin, RuntimeFor(job.Run.Runtime.Provider), admittedArgs)
	if err != nil {
		return RunAttestation{}, err
	}
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
	cfg, err := effectiveConfigDigest(RuntimeFor(job.Run.Runtime.Provider), admittedArgs)
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
	delivered, err := deliverableContentDigest(deliverableRoot)
	if err != nil {
		return RunAttestation{}, err
	}
	verified, err := submissionDigest(checkID(job.Run), verification, criterion, evidence)
	if err != nil {
		return RunAttestation{}, err
	}
	body := RunAttestation{
		SchemaVersion: attestationSchema, RunID: job.Run.ID, Nonce: nonce,
		ArtifactDigest: artifact, PolicyDigest: policy, EffectiveConfigDigest: cfg,
		EffectiveEndpoint: e.Hosts[0], EndpointEnforcement: EndpointNotEnforced,
		ObservedModels: uniqueSorted(observed), Platform: runtime.GOOS, ProbeResult: ProbeNotRun,
		WorkspaceBefore: wsBefore, WorkspaceAfter: wsAfter,
		RequestedModel: model, CheckID: checkID(job.Run),
		DeliverableDigest: delivered, VerificationDigest: verified,
	}
	priv, err := SigningKey()
	if err != nil {
		return RunAttestation{}, err
	}
	return SignAttestation(body, priv)
}

func effectiveConfigDigest(harness string, args []string) (Digest, error) {
	material, err := configMaterial(harness, args)
	if err != nil {
		return Digest{}, err
	}
	raw, err := json.Marshal(material)
	if err != nil {
		return Digest{}, err
	}
	sum, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return Digest{}, err
	}
	return Digest{Algorithm: "sha256", Value: sum}, nil
}

// configMaterial is the generated config the digest covers, in argv order.
// The model flag is included, in every form. The prompt is not.
func configMaterial(harness string, args []string) ([]string, error) {
	boolFlags := map[string]bool{
		"--ignore-user-config": true, "--ignore-rules": true, "--ephemeral": true,
		"--restricted": true, "--strict-mcp-config": true, "--disable-slash-commands": true,
		"--no-session-persistence": true,
	}
	valued := map[string]bool{
		"--setting-sources": true, "--disable": true, "--disallowedTools": true,
		"-c": true, "-m": true, "--settings": true, "--config": true, "--model": true,
	}
	var out []string
	err := walkCountedArgs(harness, args, func(name, value string) error {
		if boolFlags[name] && value == "" {
			out = append(out, name)
		}
		if valued[name] && value != "" {
			out = append(out, name, value)
		}
		return nil
	})
	if out == nil {
		out = []string{}
	}
	return out, err
}

type namedSHA struct {
	Name string `json:"name"`
	SHA  string `json:"sha256"`
}

func deliverableContentDigest(root string) (Digest, error) {
	var rows []namedSHA
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || d.Type()&os.ModeSymlink != 0 {
			return err
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(b)
		rows = append(rows, namedSHA{Name: filepath.ToSlash(rel), SHA: hex.EncodeToString(sum[:])})
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return Digest{}, err
	}
	return canonicalNamed(rows)
}

func submissionDigest(id string, verification, criterion json.RawMessage, evidence []Artifact) (Digest, error) {
	outcome := ""
	findings := json.RawMessage("[]")
	if len(bytesTrim(verification)) > 0 {
		var parsed struct {
			Outcome  string          `json:"outcome"`
			Findings json.RawMessage `json:"findings"`
		}
		if err := json.Unmarshal(verification, &parsed); err != nil {
			return Digest{}, err
		}
		outcome = parsed.Outcome
		if len(parsed.Findings) > 0 && string(parsed.Findings) != "null" {
			findings = parsed.Findings
		}
	}
	crit := json.RawMessage("null")
	if len(bytesTrim(criterion)) > 0 {
		crit = criterion
	}
	var ev []namedSHA
	for _, a := range evidence {
		if a.Digest.Value == "" {
			continue
		}
		ev = append(ev, namedSHA{Name: a.Path, SHA: a.Digest.Value})
	}
	sort.Slice(ev, func(i, j int) bool { return utf16Less(ev[i].Name, ev[j].Name) })
	raw, err := json.Marshal(struct {
		CheckID   string          `json:"check_id"`
		Criterion json.RawMessage `json:"criterion_results"`
		Evidence  []namedSHA      `json:"evidence"`
		Findings  json.RawMessage `json:"findings"`
		Outcome   string          `json:"outcome"`
	}{id, crit, nonNilNamed(ev), findings, outcome})
	if err != nil {
		return Digest{}, err
	}
	sum, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return Digest{}, err
	}
	return Digest{Algorithm: "sha256", Value: sum}, nil
}

func canonicalNamed(rows []namedSHA) (Digest, error) {
	sort.Slice(rows, func(i, j int) bool { return utf16Less(rows[i].Name, rows[j].Name) })
	raw, err := json.Marshal(nonNilNamed(rows))
	if err != nil {
		return Digest{}, err
	}
	sum, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return Digest{}, err
	}
	return Digest{Algorithm: "sha256", Value: sum}, nil
}

// utf16Less is RFC 8785 key order: UTF-16 code units, not Go's UTF-8 byte order.
func utf16Less(a, b string) bool {
	ua := utf16.Encode([]rune(a))
	ub := utf16.Encode([]rune(b))
	n := len(ua)
	if len(ub) < n {
		n = len(ub)
	}
	for i := 0; i < n; i++ {
		if ua[i] != ub[i] {
			return ua[i] < ub[i]
		}
	}
	return len(ua) < len(ub)
}

func nonNilNamed(rows []namedSHA) []namedSHA {
	if rows == nil {
		return []namedSHA{}
	}
	return rows
}

func bytesTrim(b json.RawMessage) json.RawMessage {
	return json.RawMessage(strings.TrimSpace(string(b)))
}
