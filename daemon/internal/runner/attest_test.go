package runner

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/flyfission/control-rod/daemon/internal/digest"
)

func TestHarnessFollowsDigestNotName(t *testing.T) {
	real := sha256.Sum256([]byte("registered-claude-bytes"))
	other := sha256.Sum256([]byte("renamed-binary-bytes"))
	sum := hex.EncodeToString(real[:])
	RegisterHarnessForTest(sum, RuntimeClaude)
	t.Cleanup(func() { UnregisterHarnessForTest(sum) })
	// The other bytes are what a binary named "claude" would hash to after a rename.
	if _, ok := HarnessForDigest(hex.EncodeToString(other[:]), nil); ok {
		t.Fatal("a digest that is not registered was accepted")
	}
	got, ok := HarnessForDigest(sum, nil)
	if !ok || got != RuntimeClaude {
		t.Fatalf("digest lookup = %q %v", got, ok)
	}
	pin := &RuntimePin{Runtime: RuntimeCodex, Digest: Digest{Algorithm: "sha256", Value: hex.EncodeToString(other[:])}}
	got, ok = HarnessForDigest(pin.Digest.Value, pin)
	if !ok || got != RuntimeCodex {
		t.Fatalf("pin lookup = %q %v", got, ok)
	}
}

func TestCheckerRefusesCustomBaseURL(t *testing.T) {
	job := countedJob(t)
	args := append([]string{}, mustCodexArgs(t, job)...)
	args = append(args, "-c", `model_providers.ollama.base_url="https://ollama.com/v1"`)
	cmd := fakeCmd(args)
	sum := registerJobHarness(t, job)
	err := CheckerAdmissionJob(job, cmd, &Digest{Algorithm: "sha256", Value: sum})
	if err == nil || !strings.Contains(err.Error(), "custom base URL") {
		t.Fatalf("custom base URL: %v", err)
	}
}

func TestCheckerRefusesBaseURLEnv(t *testing.T) {
	job := countedJob(t)
	cmd := fakeCmd(mustCodexArgs(t, job))
	cmd.Env = append(cmd.Env, "OPENAI_BASE_URL=http://127.0.0.1:11434")
	sum := registerJobHarness(t, job)
	err := CheckerAdmissionJob(job, cmd, &Digest{Algorithm: "sha256", Value: sum})
	if err == nil || !strings.Contains(err.Error(), "OPENAI_BASE_URL") {
		t.Fatalf("env base url: %v", err)
	}
}

func TestCheckerRefusesUnregisteredModel(t *testing.T) {
	job := countedJob(t)
	job.Run.Runtime.Model = "default"
	cmd := fakeCmd(mustCodexArgs(t, job))
	sum := registerJobHarness(t, job)
	err := CheckerAdmissionJob(job, cmd, &Digest{Algorithm: "sha256", Value: sum})
	if err == nil || !strings.Contains(err.Error(), "not registered") {
		t.Fatalf("default model: %v", err)
	}
}

func TestCheckerRefusesModelAliasAndExtraModel(t *testing.T) {
	job := countedJob(t)
	if err := ObservedModelsAllowed(job.Run, nil, "", []string{"codex"}); err == nil {
		t.Fatal("alias counted")
	}
	if err := ObservedModelsAllowed(job.Run, nil, "", []string{"gpt-5-codex", "gpt-5-codex-mini"}); err == nil {
		t.Fatal("extra model counted")
	}
	if err := ObservedModelsAllowed(job.Run, nil, "", []string{"gpt-5-codex"}); err != nil {
		t.Fatal(err)
	}
}

func TestLocalModelIsNotDecidingOnSafety(t *testing.T) {
	reg := &ModelRegistry{Models: []ModelEntry{{
		ID: "local-ollama", Harness: RuntimeCodex, Names: []string{"local-ollama"},
		Hosts: []string{"127.0.0.1:11434"}, Deciding: false, Local: true,
	}}}
	if _, err := reg.Admit("local-ollama", RuntimeCodex, "safety"); err == nil {
		t.Fatal("local model counted on safety")
	}
	if _, err := reg.Admit("local-ollama", RuntimeCodex, "material"); err == nil {
		t.Fatal("local model counted on material")
	}
}

func TestCountedRunDisablesDelegation(t *testing.T) {
	job := countedJob(t)
	args := mustCodexArgs(t, job)
	if !argPair(args, "--disable", "multi_agent") || !containsArg(args, "--ignore-user-config") {
		t.Fatalf("codex counted flags: %q", args)
	}
	bad := append(append([]string{}, args...), "--fallback-model", "other")
	sum := registerJobHarness(t, job)
	err := CheckerAdmissionJob(job, fakeCmd(bad), &Digest{Algorithm: "sha256", Value: sum})
	if err == nil || !strings.Contains(err.Error(), "--fallback-model") {
		t.Fatalf("fallback: %v", err)
	}
}

func TestAttestationSignsAndRejectsTamper(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	a := sampleAttestation()
	signed, err := SignAttestation(a, priv)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyAttestationSignature(signed, pub); err != nil {
		t.Fatal(err)
	}
	signed.EffectiveEndpoint = "https://ollama.com/v1"
	if err := VerifyAttestationSignature(signed, pub); err == nil {
		t.Fatal("tampered endpoint verified")
	}
	signed = mustSign(t, a, priv)
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	if err := VerifyAttestationSignature(signed, other); err == nil {
		t.Fatal("unknown key verified")
	}
}

func TestFileKeyRequiresFakeAndMode(t *testing.T) {
	dir := t.TempDir()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "key")
	if err := os.WriteFile(path, priv, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONTROLROD_TEST_ATTESTATION_KEY", path)
	t.Setenv("CONTROLROD_ALLOW_FAKE", "")
	if _, err, used := testFileKey(); !used || err == nil {
		t.Fatalf("file key without fake switch: used=%v err=%v", used, err)
	}
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	if _, err, used := testFileKey(); !used || err == nil || !strings.Contains(err.Error(), "0600") {
		t.Fatalf("loose mode: used=%v err=%v", used, err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	got, err, used := testFileKey()
	if !used || err != nil {
		t.Fatal(err)
	}
	if !got.Equal(priv) {
		t.Fatal("file key bytes differ")
	}
}

func TestLogBufferCollectsEveryModel(t *testing.T) {
	b := &logBuffer{}
	b.add(`{"type":"turn.started","model":"gpt-5-codex"}`)
	b.add(`{"type":"turn.started","model":"gpt-5-codex-mini"}`)
	b.add(`{"type":"turn.started","model":"gpt-5-codex"}`)
	got := b.observedModels()
	if strings.Join(got, ",") != "gpt-5-codex,gpt-5-codex-mini" {
		t.Fatalf("observed %q", got)
	}
	if b.reportedModel() != "gpt-5-codex" {
		t.Fatalf("reported %q", b.reportedModel())
	}
}

func countedJob(t *testing.T) *Job {
	t.Helper()
	policy := Digest{Algorithm: "sha256", Value: hex.EncodeToString(sha256.New().Sum(nil))}
	// sha256.New().Sum(nil) is the hash of empty, which is fine as a fixture digest.
	return &Job{
		Run: Run{
			ID: "run-attest", Role: "pre-check",
			Runtime: RuntimeRef{Kind: "subscription", Provider: "openai", Model: "gpt-5-codex"},
		},
		SandboxPolicyDigest: &policy,
	}
}

func mustCodexArgs(t *testing.T, job *Job) []string {
	t.Helper()
	ws := &Workspace{Dir: t.TempDir(), Checker: true}
	p := &SandboxPolicy{ID: "p", Version: 1, Driver: "native-cli", EnabledTools: []string{"command", "read", "edit", "write", "search"}}
	args, err := CodexArgs(ws, RequestedModel(job.Run), p, SandboxPaths{})
	if err != nil {
		t.Fatal(err)
	}
	return args
}

func fakeCmd(args []string) *exec.Cmd {
	if len(args) == 0 {
		return exec.Command("true")
	}
	return exec.Command(args[0], args[1:]...)
}

func registerJobHarness(t *testing.T, job *Job) string {
	t.Helper()
	sum := sha256.Sum256([]byte("pin-" + job.Run.ID))
	hexSum := hex.EncodeToString(sum[:])
	job.RuntimePin = &RuntimePin{Runtime: RuntimeCodex, Digest: Digest{Algorithm: "sha256", Value: hexSum}}
	return hexSum
}

func sampleAttestation() RunAttestation {
	d := Digest{Algorithm: "sha256", Value: strings.Repeat("ab", 32)}
	return RunAttestation{
		SchemaVersion: attestationSchema, RunID: "run-1", Nonce: strings.Repeat("cd", 32),
		ArtifactDigest: d, PolicyDigest: d, EffectiveConfigDigest: d,
		EffectiveEndpoint: "api.openai.com", EndpointEnforcement: EndpointNotEnforced,
		ObservedModels: []string{"gpt-5-codex"}, Platform: "linux", ProbeResult: ProbeNotRun,
		WorkspaceBefore: d, WorkspaceAfter: d,
		RequestedModel: "gpt-5-codex", CheckID: "run-1:0",
		DeliverableDigest: d, VerificationDigest: d,
	}
}

func mustSign(t *testing.T, a RunAttestation, priv ed25519.PrivateKey) RunAttestation {
	t.Helper()
	signed, err := SignAttestation(a, priv)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestAttestationVector(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	quoted := sampleAttestation()
	quoted.RequestedModel = "café \"quoted\" \\slash"
	empty := sampleAttestation()
	empty.ObservedModels = []string{}
	cases := []RunAttestation{sampleAttestation(), quoted, empty}
	// The vector is written by this test when UPDATE_ATTESTATION_VECTOR=1.
	// Later runs recompute the hash. The TypeScript verifier reads the same file.
	path := filepath.Join("testdata", "attestation-vector.json")
	type stored struct {
		Name    string     `json:"name"`
		Payload signedBody `json:"payload"`
		Hash    string     `json:"hash"`
	}
	if os.Getenv("UPDATE_ATTESTATION_VECTOR") == "1" {
		signed, err := SignAttestation(cases[0], priv)
		if err != nil {
			t.Fatal(err)
		}
		var out []stored
		for i, c := range cases {
			sum, err := AttestationHash(c)
			if err != nil {
				t.Fatal(err)
			}
			out = append(out, stored{Name: []string{"ascii", "non-ascii", "empty-models"}[i], Payload: c.signed(), Hash: hex.EncodeToString(sum)})
		}
		raw, err := json.MarshalIndent(map[string]any{
			"cases": out, "public_key": PublicKeyBase64(pub), "signature": signed.Signature, "key_id": signed.KeyID,
		}, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var vec struct {
		Cases []stored `json:"cases"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil {
		t.Fatal(err)
	}
	if len(vec.Cases) != 3 {
		t.Fatalf("cases %d", len(vec.Cases))
	}
	for _, c := range vec.Cases {
		a := RunAttestation{
			SchemaVersion: c.Payload.SchemaVersion, RunID: c.Payload.RunID, Nonce: c.Payload.Nonce,
			ArtifactDigest: c.Payload.ArtifactDigest, PolicyDigest: c.Payload.PolicyDigest,
			EffectiveConfigDigest: c.Payload.EffectiveConfigDigest, EffectiveEndpoint: c.Payload.EffectiveEndpoint,
			EndpointEnforcement: c.Payload.EndpointEnforcement, ObservedModels: c.Payload.ObservedModels,
			Platform: c.Payload.Platform, ProbeResult: c.Payload.ProbeResult,
			WorkspaceBefore: c.Payload.WorkspaceBefore, WorkspaceAfter: c.Payload.WorkspaceAfter,
			RequestedModel: c.Payload.RequestedModel, CheckID: c.Payload.CheckID,
			DeliverableDigest: c.Payload.DeliverableDigest, VerificationDigest: c.Payload.VerificationDigest,
		}
		sum, err := AttestationHash(a)
		if err != nil {
			t.Fatal(err)
		}
		if hex.EncodeToString(sum) != c.Hash {
			t.Fatalf("%s hash %s", c.Name, hex.EncodeToString(sum))
		}
	}
	// An absent observed_models key is not the same payload as an empty array.
	absent := cases[2].signed()
	present, err := json.Marshal(absent)
	if err != nil {
		t.Fatal(err)
	}
	var generic map[string]any
	if err := json.Unmarshal(present, &generic); err != nil {
		t.Fatal(err)
	}
	delete(generic, "observed_models")
	dropped, err := json.Marshal(generic)
	if err != nil {
		t.Fatal(err)
	}
	with, err := digest.CanonicalSHA256(present)
	if err != nil {
		t.Fatal(err)
	}
	without, err := digest.CanonicalSHA256(dropped)
	if err != nil {
		t.Fatal(err)
	}
	if with == without {
		t.Fatal("dropping observed_models did not change the canonical hash")
	}
}

func TestCountedConfigParsing(t *testing.T) {
	job := countedJob(t)
	sum := registerJobHarness(t, job)
	base := mustCodexArgs(t, job)
	artifact := &Digest{Algorithm: "sha256", Value: sum}
	eq := append(append([]string{}, base...), `-c=model_providers.ollama.base_url="http://127.0.0.1:11434"`)
	if err := CheckerAdmissionJob(job, fakeCmd(eq), artifact); err == nil || !strings.Contains(err.Error(), "custom base URL") {
		t.Fatalf("--flag=value: %v", err)
	}
	profile := append(append([]string{}, base...), "--profile", "loose")
	if err := CheckerAdmissionJob(job, fakeCmd(profile), artifact); err == nil || !strings.Contains(err.Error(), "profile") {
		t.Fatalf("profile: %v", err)
	}
	fallback := append(append([]string{}, base...), "--fallback-model=other")
	if err := CheckerAdmissionJob(job, fakeCmd(fallback), artifact); err == nil {
		t.Fatal("inline fallback was accepted")
	}
	fileSettings := append(append([]string{}, base...), "--settings", "/tmp/user-settings.json")
	if err := CheckerAdmissionJob(job, fakeCmd(fileSettings), artifact); err == nil || !strings.Contains(err.Error(), "file path") {
		t.Fatalf("settings file: %v", err)
	}
	inline := append(append([]string{}, base...), "--settings", `{"env":{"CLAUDE_CODE_USE_BEDROCK":"1"}}`)
	if err := CheckerAdmissionJob(job, fakeCmd(inline), artifact); err == nil || !strings.Contains(err.Error(), "CLAUDE_CODE_USE_BEDROCK") {
		t.Fatalf("settings env: %v", err)
	}
	helper := append(append([]string{}, base...), "--settings", `{"apiKeyHelper":"echo secret"}`)
	if err := CheckerAdmissionJob(job, fakeCmd(helper), artifact); err == nil || !strings.Contains(err.Error(), "apiKeyHelper") {
		t.Fatalf("apiKeyHelper: %v", err)
	}
	cmd := fakeCmd(base)
	cmd.Env = []string{"ALL_PROXY=http://127.0.0.1:9", "CLAUDE_CODE_USE_BEDROCK=1"}
	if err := CheckerAdmissionJob(job, cmd, artifact); err == nil {
		t.Fatal("proxy env was accepted")
	}
	kept := AgentEnv([]string{"PATH=/usr/bin", "ALL_PROXY=http://127.0.0.1:9", "HTTP_PROXY=http://127.0.0.1:9", "ANTHROPIC_BEDROCK_BASE_URL=http://x", "OPENAI_API_BASE=http://x"})
	for _, kv := range kept {
		if forbiddenEnv(strings.Split(kv, "=")[0]) {
			t.Fatalf("allowlist kept %s", kv)
		}
	}
	material := strings.Join(configMaterial(append(base, "-m", "gpt-5-codex")), "\n")
	if !strings.Contains(material, "-m") || !strings.Contains(material, "gpt-5-codex") {
		t.Fatalf("model flag not in config digest material: %s", material)
	}
}

func TestKeychainFailureIsNotAMissingKey(t *testing.T) {
	if err := classifyKeychain(1, []byte("The specified item could not be found")); !errors.Is(err, errKeyNotFound) {
		t.Fatal(err)
	}
	if err := classifyKeychain(1, []byte("The name org.freedesktop.secrets was not provided")); !errors.Is(err, errKeychainUnavailable) || errors.Is(err, errKeyNotFound) {
		t.Fatal(err)
	}
	if err := classifyKeychain(1, nil); !errors.Is(err, errKeychainUnavailable) {
		t.Fatal(err)
	}
}

func containsArg(args []string, flag string) bool {
	for _, a := range args {
		if a == flag {
			return true
		}
	}
	return false
}
