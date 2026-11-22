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
	"slices"
	"sort"
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

func TestCheckerAttestationUsesAdmittedRuntimeArguments(t *testing.T) {
	job := countedJob(t)
	cmd := fakeCmd(mustCodexArgs(t, job))
	artifact := Digest{Algorithm: "sha256", Value: registerJobHarness(t, job)}
	if err := CheckerAdmissionJob(job, cmd, &artifact); err != nil {
		t.Fatal(err)
	}
	admitted := slices.Clone(cmd.Args)
	// Seatbelt's -p selects its sandbox profile. It never reaches the runtime.
	cmd.Args = append([]string{"sandbox-exec", "-p", "(version 1)"}, cmd.Args...)
	if _, err := effectiveConfigDigest(RuntimeCodex, cmd.Args); err == nil {
		t.Fatal("the wrapped command was accepted as a runtime command")
	}

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "key")
	if err := os.WriteFile(path, priv, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONTROLROD_TEST_ATTESTATION_KEY", path)
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	before := job.SandboxPolicyDigest.Value
	att, err := BuildCheckerAttestation(job, admitted, artifact, t.TempDir(), before, before,
		[]string{"gpt-5-codex"}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantConfig, err := effectiveConfigDigest(RuntimeCodex, admitted)
	if err != nil || att.EffectiveConfigDigest != wantConfig {
		t.Fatalf("attested config %+v, want %+v: %v", att.EffectiveConfigDigest, wantConfig, err)
	}
	if err := VerifyAttestationSignature(att, pub); err != nil {
		t.Fatal(err)
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
		order, err := attestationOrder()
		if err != nil {
			t.Fatal(err)
		}
		raw, err := json.MarshalIndent(map[string]any{
			"cases": out, "order": order, "public_key": PublicKeyBase64(pub), "signature": signed.Signature, "key_id": signed.KeyID,
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
		Cases []stored       `json:"cases"`
		Order map[string]any `json:"order"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil {
		t.Fatal(err)
	}
	wantOrder, err := attestationOrder()
	if err != nil {
		t.Fatal(err)
	}
	gotNames, _ := vec.Order["names"].([]any)
	wantNames, _ := wantOrder["names"].([]string)
	if len(gotNames) != len(wantNames) || len(wantNames) != 2 || gotNames[0] != wantNames[0] || gotNames[1] != wantNames[1] || vec.Order["names_hash"] != wantOrder["names_hash"] || vec.Order["keys_hash"] != wantOrder["keys_hash"] {
		t.Fatalf("order %+v want %+v", vec.Order, wantOrder)
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

func attestationOrder() (map[string]any, error) {
	emoji, high := "😀.md", "\uffff.md"
	if emoji < high || !utf16Less(emoji, high) {
		return nil, errors.New("the emoji and U+FFFF no longer disagree between byte order and UTF-16")
	}
	names := []string{high, emoji}
	sort.Slice(names, func(i, j int) bool { return utf16Less(names[i], names[j]) })
	raw, err := json.Marshal(names)
	if err != nil {
		return nil, err
	}
	namesHash, err := digest.CanonicalSHA256(raw)
	if err != nil {
		return nil, err
	}
	keys := []byte("{\"\\uffff\":1,\"😀\":2}")
	keysHash, err := digest.CanonicalSHA256(keys)
	if err != nil {
		return nil, err
	}
	return map[string]any{"names": names, "names_hash": namesHash, "keys_hash": keysHash}, nil
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
	material, err := configMaterial("codex", append(base, "-m", "gpt-5-codex"))
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(material, "\n")
	if !strings.Contains(joined, "-m") || !strings.Contains(joined, "gpt-5-codex") {
		t.Fatalf("model flag not in config digest material: %s", joined)
	}
	attachedModel, err := configMaterial("codex", append(base, "-mgpt-5-codex"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(attachedModel, "\n"), "-m\ngpt-5-codex") {
		t.Fatalf("attached model flag: %s", attachedModel)
	}
	for _, args := range [][]string{{"-m", "gpt-5-codex"}, {"-mgpt-5-codex"}, {"--model", "gpt-5-codex"}, {"--model=gpt-5-codex"}} {
		got, err := argvModel("codex", args)
		if err != nil || got != "gpt-5-codex" {
			t.Fatalf("argv model %q: %v %q", args, err, got)
		}
	}
	if _, err := modelForCheck(job.Run, nil, "codex", []string{"-mother"}); err == nil {
		t.Fatal("attached -m naming another model was accepted")
	}
	if got, err := modelForCheck(job.Run, nil, "codex", []string{"--model=gpt-5-codex"}); err != nil || got != "gpt-5-codex" {
		t.Fatalf("requested model: %v %q", err, got)
	}
	provider := append(append([]string{}, base...), `-cmodel_provider="ollama"`)
	if err := CheckerAdmissionJob(job, fakeCmd(provider), artifact); err == nil || !strings.Contains(err.Error(), "custom base URL") {
		t.Fatalf("attached -c: %v", err)
	}
	providers := append(append([]string{}, base...), `-cmodel_providers.ollama.base_url="http://127.0.0.1:11434"`)
	if err := CheckerAdmissionJob(job, fakeCmd(providers), artifact); err == nil || !strings.Contains(err.Error(), "custom base URL") {
		t.Fatalf("attached -c base url: %v", err)
	}
	shortProfile := append(append([]string{}, base...), "-pfoo")
	if err := CheckerAdmissionJob(job, fakeCmd(shortProfile), artifact); err == nil || !strings.Contains(err.Error(), "profile") {
		t.Fatalf("attached -p: %v", err)
	}
	if err := scanArgs("claude", []string{"-pThe prompt"}); err != nil {
		t.Fatalf("claude -p is the print prompt: %v", err)
	}
	prompt := []string{"-p", "Review the base_url validation"}
	if err := scanArgs("claude", prompt); err != nil {
		t.Fatalf("claude prompt: %v", err)
	}
	promptMaterial, err := configMaterial("claude", prompt)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.Join(promptMaterial, "\n"), "base_url") || strings.Contains(strings.Join(promptMaterial, "\n"), "-p") {
		t.Fatalf("prompt leaked into config material: %q", promptMaterial)
	}
	settings := []string{"-p", "--settings", "/tmp/user-settings.json"}
	if err := scanArgs("claude", settings); err == nil || !strings.Contains(err.Error(), "file path") {
		t.Fatalf("claude -p then settings file: %v", err)
	}
	fallbackAfterPrint := []string{"-p", "--fallback-model", "x"}
	if err := scanArgs("claude", fallbackAfterPrint); err == nil || !strings.Contains(err.Error(), "--fallback-model") {
		t.Fatalf("claude -p then fallback: %v", err)
	}
	if err := scanArgs("codex", []string{"--profile=foo"}); err == nil || !strings.Contains(err.Error(), "profile") {
		t.Fatalf("codex --profile=foo: %v", err)
	}
	if err := scanArgs("claude", []string{"--settings", "--fallback-model"}); err == nil {
		t.Fatal("a valued flag consumed the next flag")
	}
	ws := &Workspace{Dir: t.TempDir(), Checker: true}
	policy := &SandboxPolicy{ID: "p", Version: 1, Driver: "native-cli", EnabledTools: []string{"command", "read", "edit", "write", "search"}}
	claude := ClaudeArgs(ws, "claude-sonnet-4-5", policy, SandboxPaths{})
	if err := scanArgs("claude", claude); err != nil {
		t.Fatalf("real claude argv: %v", err)
	}
	claudeMaterial, err := configMaterial("claude", claude)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.Join(claudeMaterial, "\n"), "BRIEF.md") {
		t.Fatal("claude prompt is in the config digest")
	}
}

func TestKeychainFailureIsNotAMissingKey(t *testing.T) {
	if err := classifyKeychain(1, []byte("The specified item could not be found")); !errors.Is(err, errKeyNotFound) {
		t.Fatal(err)
	}
	if err := classifyKeychain(1, nil); !errors.Is(err, errKeyNotFound) {
		t.Fatalf("empty stderr: %v", err)
	}
	if err := classifyKeychain(1, []byte("GDBus.Error: org.freedesktop.DBus.Error.ServiceUnknown")); !errors.Is(err, errKeychainUnavailable) || errors.Is(err, errKeyNotFound) {
		t.Fatal(err)
	}
	if err := classifyKeychain(2, nil); !errors.Is(err, errKeychainUnavailable) || errors.Is(err, errKeyNotFound) {
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
