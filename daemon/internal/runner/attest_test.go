package runner

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
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
	if err := ObservedModelsAllowed(job.Run, "", []string{"codex"}); err == nil {
		t.Fatal("alias counted")
	}
	if err := ObservedModelsAllowed(job.Run, "", []string{"gpt-5-codex", "gpt-5-codex-mini"}); err == nil {
		t.Fatal("extra model counted")
	}
	if err := ObservedModelsAllowed(job.Run, "", []string{"gpt-5-codex"}); err != nil {
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
	// The vector key is generated in this test when UPDATE_ATTESTATION_VECTOR=1.
	// The committed file is that tool output, checked on later runs.
	path := filepath.Join("testdata", "attestation-vector.json")
	if os.Getenv("UPDATE_ATTESTATION_VECTOR") == "1" {
		signed, err := SignAttestation(sampleAttestation(), priv)
		if err != nil {
			t.Fatal(err)
		}
		sum, err := AttestationHash(signed)
		if err != nil {
			t.Fatal(err)
		}
		vec := map[string]any{
			"payload":    signed.signed(),
			"hash":       hex.EncodeToString(sum),
			"public_key": PublicKeyBase64(pub),
			"signature":  signed.Signature,
			"key_id":     signed.KeyID,
		}
		raw, err := json.MarshalIndent(vec, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Log("wrote", path)
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var vec struct {
		Payload   signedBody `json:"payload"`
		Hash      string     `json:"hash"`
		PublicKey string     `json:"public_key"`
		Signature string     `json:"signature"`
		KeyID     string     `json:"key_id"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil {
		t.Fatal(err)
	}
	a := RunAttestation{
		SchemaVersion: vec.Payload.SchemaVersion, RunID: vec.Payload.RunID, Nonce: vec.Payload.Nonce,
		ArtifactDigest: vec.Payload.ArtifactDigest, PolicyDigest: vec.Payload.PolicyDigest,
		EffectiveConfigDigest: vec.Payload.EffectiveConfigDigest, EffectiveEndpoint: vec.Payload.EffectiveEndpoint,
		EndpointEnforcement: vec.Payload.EndpointEnforcement, ObservedModels: vec.Payload.ObservedModels,
		Platform: vec.Payload.Platform, ProbeResult: vec.Payload.ProbeResult,
		WorkspaceBefore: vec.Payload.WorkspaceBefore, WorkspaceAfter: vec.Payload.WorkspaceAfter,
		KeyID: vec.KeyID, Signature: vec.Signature,
	}
	sum, err := AttestationHash(a)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(sum) != vec.Hash {
		t.Fatalf("hash %s", hex.EncodeToString(sum))
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
