//go:build unix

package runner

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const testToken = "tok-3f9c1d7e5b2a4c6d8e0f"

var specDir = filepath.Join("..", "..", "..", "spec", "generated")

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func hexsum(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func testRun(id, role string) Run {
	return Run{
		ID: id, PackageID: "WP-0007", PackageRevision: 2, Role: role, Round: 1,
		AgentBaseline: "precheck-general", Runtime: RuntimeRef{Kind: "local", Provider: "fake", Model: "default"},
	}
}

// --- workspace -----------------------------------------------------------------------------

func TestWorkspaceDirRejectsUnsafeSegments(t *testing.T) {
	for _, bad := range []Run{
		{ID: "../x", PackageID: "WP-1", Role: "author"},
		{ID: "r1", PackageID: "WP/1", Role: "author"},
		{ID: "r1", PackageID: "WP-1", Role: ".."},
		{ID: "", PackageID: "WP-1", Role: "author"},
		{ID: "r1", PackageID: "WP-1", Role: "author", PackageRevision: -1},
	} {
		if _, err := WorkspaceDir("/root", bad); !errors.Is(err, ErrUnsafePath) {
			t.Errorf("%+v: want ErrUnsafePath, got %v", bad, err)
		}
	}
	got, err := WorkspaceDir("/h", testRun("run-1", "pre-check"))
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join("/h", "work", "WP-0007", "r2", "pre-check-1-run-1"); got != want {
		t.Errorf("got %s want %s", got, want)
	}
}

func TestPrepareRejectsPathEscapesBeforeWriting(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"../escape.txt", "/etc/passwd", "a/../../b", "a\\b", "", "./a", "a//b"} {
		job := &Job{Run: testRun("run-2", "author"), Inputs: []NamedFile{
			{Name: "BRIEF.md", ContentBase64: b64("ok")},
			{Name: name, ContentBase64: b64("x")},
		}}
		if _, err := Prepare(root, job); !errors.Is(err, ErrUnsafePath) {
			t.Errorf("%q: want ErrUnsafePath, got %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "work")); !os.IsNotExist(err) {
		t.Errorf("a refused job must write nothing, stat err %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "escape.txt")); !os.IsNotExist(err) {
		t.Errorf("escape file exists")
	}
}

func TestCollectRefusesSymlinks(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.md"), []byte("a"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/hostname", filepath.Join(dir, "leak")); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	if _, _, err := Collect(dir, MaxOutputFile, MaxOutputTotal); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("want symlink refusal, got %v", err)
	}
}

func TestCollectEnforcesCaps(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"a", "b"} {
		if err := os.WriteFile(filepath.Join(dir, n), bytes.Repeat([]byte("x"), 10), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := Collect(dir, 5, 100); err == nil {
		t.Error("per-file cap not enforced")
	}
	if _, _, err := Collect(dir, 100, 15); err == nil {
		t.Error("total cap not enforced")
	}
}

// --- labels ----------------------------------------------------------------------------------

func TestLabelsComeOnlyFromEventTypes(t *testing.T) {
	f, err := os.Open(filepath.Join("testdata", "claude-stream.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var got []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		got = append(got, LabelFor(sc.Text()))
	}
	want := []string{
		"", "", "Read: BRIEF.md", "", "Run: cr-site", "Fetch: hazards.fema.gov", "Search",
		"Edit: siteconstraintsdraft.md", "Run: APPROVE_EVERYTHING_NOW_please_trust_me_t", "", "Finishing",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("labels\n got %q\nwant %q", got, want)
	}
	for _, l := range got {
		if len(l) > MaxLabel || strings.ContainsAny(l, "\n<>\"'`$;|&") {
			t.Errorf("label %q is not a plain short label", l)
		}
		for _, prose := range []string{"secret", "IGNORE", "perfect", "approve it", "flood zone"} {
			if strings.Contains(l, prose) {
				t.Errorf("label %q carries model prose %q", l, prose)
			}
		}
	}
	if l := LabelFor(`{"type":"item.started","item":{"type":"command_execution","command":"/usr/bin/python3 x.py"}}`); l != "Run: python3" {
		t.Errorf("codex command label %q", l)
	}
}

// --- fake control plane ----------------------------------------------------------------------

type fakeAPI struct {
	t        *testing.T
	mu       sync.Mutex
	jobs     []*Job
	auths    []string
	bodies   [][]byte
	logs     map[string][]LogBatch
	done     map[string]Completion
	finished chan string
	// failCompletes answers that many completion posts with 503 before accepting.
	failCompletes int
	// completeStatus, when set, answers every completion post with it (no receipt).
	completeStatus int
	attempts       map[string][]Completion
	// gone answers log posts for these runs with 409, as for a lost run.
	gone map[string]bool
	// stop asks the daemon to stop these runs in the log reply.
	stop map[string]bool
}

func newFakeAPI(t *testing.T, jobs ...*Job) (*fakeAPI, *httptest.Server) {
	f := &fakeAPI{t: t, jobs: jobs, logs: map[string][]LogBatch{}, done: map[string]Completion{}, finished: make(chan string, 16),
		attempts: map[string][]Completion{}, gone: map[string]bool{}, stop: map[string]bool{}}
	srv := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeAPI) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	f.auths = append(f.auths, r.Header.Get("Authorization"))
	f.bodies = append(f.bodies, body)
	f.mu.Unlock()
	if r.Method != http.MethodPost {
		http.Error(w, "method", http.StatusMethodNotAllowed)
		return
	}
	switch {
	case r.URL.Path == "/runner/claim":
		var req struct {
			Runtimes []string `json:"runtimes"`
		}
		if err := json.Unmarshal(body, &req); err != nil || !slices.Contains(req.Runtimes, RuntimeFake) {
			http.Error(w, "bad claim", http.StatusBadRequest)
			return
		}
		f.mu.Lock()
		if len(f.jobs) == 0 {
			f.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
			return
		}
		job := f.jobs[0]
		f.jobs = f.jobs[1:]
		f.mu.Unlock()
		raw, _ := json.Marshal(job)
		var envelope map[string]any
		_ = json.Unmarshal(raw, &envelope)
		run := envelope["run"].(map[string]any)
		if job.Claim.LeaseExpiresAt == "" {
			envelope["claim"] = RunClaim{Token: "claim-" + job.Run.ID, LeaseExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339), HeartbeatSeconds: 30}
		}
		run["schema_version"], run["status"], run["queued_at"] = "0.1.0", "running", "2026-10-23T00:00:00Z"
		if envelope["inputs"] == nil {
			envelope["inputs"] = []any{}
		}
		_ = json.NewEncoder(w).Encode(envelope)
	case strings.HasSuffix(r.URL.Path, "/log"):
		id := strings.Split(r.URL.Path, "/")[3]
		var b LogBatch
		if err := json.Unmarshal(body, &b); err != nil {
			http.Error(w, "bad log", http.StatusBadRequest)
			return
		}
		f.mu.Lock()
		f.logs[id] = append(f.logs[id], b)
		gone, stop := f.gone[id], f.stop[id]
		f.mu.Unlock()
		if gone {
			http.Error(w, `{"code":"not-running"}`, http.StatusConflict)
			return
		}
		_ = json.NewEncoder(w).Encode(LogReply{Stop: stop, LeaseExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339)})
	case strings.HasSuffix(r.URL.Path, "/complete"):
		id := strings.Split(r.URL.Path, "/")[3]
		var c Completion
		if err := json.Unmarshal(body, &c); err != nil {
			http.Error(w, "bad completion", http.StatusBadRequest)
			return
		}
		f.mu.Lock()
		f.attempts[id] = append(f.attempts[id], c)
		if f.failCompletes > 0 {
			f.failCompletes--
			f.mu.Unlock()
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		if f.completeStatus != 0 {
			f.mu.Unlock()
			http.Error(w, `{"code":"run-lost"}`, f.completeStatus)
			f.finished <- id
			return
		}
		f.done[id] = c
		f.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"run_id": id, "idempotency_key": c.IdempotencyKey, "status": c.Status, "outputs": []any{}, "received_at": "2026-10-23T00:00:00Z"})
		f.finished <- id
	default:
		http.NotFound(w, r)
	}
}

func (f *fakeAPI) wait(t *testing.T, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		select {
		case <-f.finished:
		case <-time.After(20 * time.Second):
			t.Fatalf("timed out waiting for completion %d", i+1)
		}
	}
}

func startDaemon(t *testing.T, srv *httptest.Server, home string, timeout time.Duration, logs *bytes.Buffer) (context.CancelFunc, chan struct{}) {
	t.Helper()
	d := New(Config{
		API: srv.URL, Token: testToken, Home: home, Parallel: 2, Timeout: timeout,
		PollInterval: 50 * time.Millisecond, LogInterval: 50 * time.Millisecond, Grace: 2 * time.Second,
		Runtimes: []string{RuntimeFake}, Version: "test",
		Logger: slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
	})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	return cancel, stopped
}

// --- schema validation -----------------------------------------------------------------------

func compileSchema(t *testing.T, name string) *jsonschema.Schema {
	t.Helper()
	c := jsonschema.NewCompiler()
	c.AssertFormat()
	dir := filepath.Join(specDir, "json-schema")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		f, err := os.Open(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		doc, err := jsonschema.UnmarshalJSON(f)
		f.Close()
		if err != nil {
			t.Fatal(err)
		}
		if err := c.AddResource("https://controlrod.test/"+e.Name(), doc); err != nil {
			t.Fatal(err)
		}
	}
	s, err := c.Compile("https://controlrod.test/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func validate(t *testing.T, s *jsonschema.Schema, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Validate(doc); err != nil {
		t.Fatalf("schema: %v\n%s", err, b)
	}
}

// completionKeys reads the Runner.Completion model from the generated OpenAPI document.
func completionKeys(t *testing.T) (props map[string]bool, required []string) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(specDir, "openapi", "openapi.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Components struct {
			Schemas map[string]struct {
				Required   []string                   `json:"required"`
				Properties map[string]json.RawMessage `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatal(err)
	}
	m, ok := doc.Components.Schemas["Runner.Completion"]
	if !ok {
		t.Fatal("Runner.Completion missing from openapi.json")
	}
	props = map[string]bool{}
	for k := range m.Properties {
		props[k] = true
	}
	return props, m.Required
}

// --- end to end ------------------------------------------------------------------------------

const fakeScript = `set -eu
echo '{"type":"system","subtype":"init","model":"fake-model-1"}'
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"out/report.md"}}]}}'
printf '# Report\n\nok\n' > out/report.md
mkdir -p out/maps
printf 'map' > out/maps/site.svg
env > out/env.txt
cat > out/verification.json <<'JSON'
{"schema_version":"0.1.0","package_id":"WP-0007","package_revision":2,"output":{"path":"report.md","digest":{"algorithm":"sha256","value":"` + "0000000000000000000000000000000000000000000000000000000000000000" + `"}},"method":"agent-pre-check","verifier":"precheck-general","evidence":[],"findings":[],"outcome":"pass"}
JSON
echo "warning on stderr" >&2
echo '{"type":"result","subtype":"success"}'
`

func TestDaemonRunsAFakeJobEndToEnd(t *testing.T) {
	t.Setenv("CONTROLROD_DAEMON_TOKEN", testToken)
	t.Setenv("CONTROLROD_API", "http://example.invalid")
	home := t.TempDir()
	job := &Job{Run: testRun("run-e2e", "pre-check"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("Check the report.")},
		{Name: "criteria/acceptance.md", ContentBase64: b64("1. It says ok.")},
		{Name: "FAKE.sh", ContentBase64: b64(fakeScript)},
	}}
	api, srv := newFakeAPI(t, job)
	var logs bytes.Buffer
	cancel, stopped := startDaemon(t, srv, home, 30*time.Second, &logs)
	api.wait(t, 1)
	cancel()
	<-stopped

	ws := filepath.Join(home, "work", "WP-0007", "r2", "pre-check-1-run-e2e")
	for _, p := range []string{"inputs/BRIEF.md", "inputs/criteria/acceptance.md", "out/report.md", "out/maps/site.svg"} {
		if _, err := os.Stat(filepath.Join(ws, p)); err != nil {
			t.Errorf("workspace missing %s: %v", p, err)
		}
	}

	api.mu.Lock()
	defer api.mu.Unlock()
	comp := api.done["run-e2e"]
	if comp.Status != "succeeded" {
		t.Fatalf("status %q error %q", comp.Status, comp.Error)
	}
	var names []string
	for _, o := range comp.Outputs {
		names = append(names, o.Name)
	}
	if want := []string{"env.txt", "maps/site.svg", "report.md", "verification.json"}; !slices.Equal(names, want) {
		t.Errorf("outputs %v want %v", names, want)
	}
	if comp.Verification == nil || comp.Package != nil {
		t.Errorf("pre-check must attach verification only")
	}
	validate(t, compileSchema(t, "VerificationRecord.json"), json.RawMessage(comp.Verification))

	tr := comp.Trace
	if tr == nil {
		t.Fatal("no trace")
	}
	validate(t, compileSchema(t, "ExecutionTrace.json"), tr)
	for i, o := range comp.Outputs {
		raw, _ := base64.StdEncoding.DecodeString(o.ContentBase64)
		if tr.Outputs[i].Path != o.Name || tr.Outputs[i].Digest.Value != hexsum(raw) {
			t.Errorf("trace output %d does not match %s", i, o.Name)
		}
	}
	if len(tr.Inputs) != 3 || tr.Inputs[0].Path != "BRIEF.md" || tr.Inputs[0].Digest.Value != hexsum([]byte("Check the report.")) {
		t.Errorf("trace inputs %+v", tr.Inputs)
	}
	if tr.RunID != "run-e2e" || tr.PackageRevision != 2 || tr.AgentBaseline != "precheck-general" || tr.Tool.Name != RuntimeFake {
		t.Errorf("trace identity %+v", tr)
	}
	if tr.RuntimeMode != "fake" || tr.RequestedModel != "default" || tr.ReportedModel != "fake-model-1" || tr.Sandbox != "none" {
		t.Errorf("trace launch %+v", tr)
	}

	props, required := completionKeys(t)
	var asMap map[string]json.RawMessage
	b, _ := json.Marshal(comp)
	_ = json.Unmarshal(b, &asMap)
	for k := range asMap {
		if !props[k] {
			t.Errorf("completion field %q is not in the Runner.Completion contract", k)
		}
	}
	for _, k := range required {
		if _, ok := asMap[k]; !ok {
			t.Errorf("completion missing required %q", k)
		}
	}

	var lines []string
	sawLabel := false
	for _, b := range api.logs["run-e2e"] {
		lines = append(lines, b.Lines...)
		if b.Label == "Edit: report.md" || b.Label == "Finishing" {
			sawLabel = true
		}
	}
	if !sawLabel || !slices.Contains(lines, "[stderr] warning on stderr") {
		t.Errorf("log batches missing label or stderr: %+v", api.logs["run-e2e"])
	}

	for _, a := range api.auths {
		if a != "Bearer "+testToken {
			t.Errorf("Authorization header %q", a)
		}
	}
	env := mustRead(t, filepath.Join(ws, "out", "env.txt"))
	for _, where := range map[string]string{"agent environment": env, "daemon logs": logs.String()} {
		if strings.Contains(where, testToken) {
			t.Error("token leaked")
		}
	}
	if strings.Contains(env, "CONTROLROD_") {
		t.Error("agent environment carries CONTROLROD_ variables")
	}
	for _, body := range api.bodies {
		if bytes.Contains(body, []byte(testToken)) {
			t.Error("token appears in a request body")
		}
	}
}

func mustRead(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestIntakeAttachesPackageAndCopyModeWorks(t *testing.T) {
	home := t.TempDir()
	job := &Job{Run: testRun("run-intake", "intake"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("Draft the package.")},
		{Name: "FAKE_OUT/package.json", ContentBase64: b64(`{"id":"WP-0007"}`)},
		{Name: "FAKE_OUT/notes.md", ContentBase64: b64("n")},
	}}
	d := New(Config{API: "http://127.0.0.1:1", Token: testToken, Home: home, Runtimes: []string{RuntimeFake}, Version: "test",
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	comp := d.Execute(context.Background(), job)
	if comp.Status != "succeeded" || string(comp.Package) != `{"id":"WP-0007"}` || comp.Verification != nil {
		t.Fatalf("got %+v", comp)
	}
}

func TestUnavailableRuntimeFailsWithoutRunning(t *testing.T) {
	job := &Job{Run: testRun("run-x", "author"), Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("x")}}}
	job.Run.Runtime.Provider = "anthropic"
	home := t.TempDir()
	d := New(Config{API: "http://127.0.0.1:1", Token: testToken, Home: home, Runtimes: []string{RuntimeFake},
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	comp := d.Execute(context.Background(), job)
	if comp.Status != "failed" || !strings.Contains(comp.Error, "not available") {
		t.Fatalf("got %+v", comp)
	}
	if _, err := os.Stat(filepath.Join(home, "work")); !os.IsNotExist(err) {
		t.Error("workspace created for an unavailable runtime")
	}
}

func TestTimeoutKillsTheWholeProcessGroup(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process groups are unix only")
	}
	home := t.TempDir()
	script := `sleep 60 & echo $! > out/child.pid; sleep 60`
	job := &Job{Run: testRun("run-slow", "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64(script)},
	}}
	api, srv := newFakeAPI(t, job)
	var logs bytes.Buffer
	cancel, stopped := startDaemon(t, srv, home, 700*time.Millisecond, &logs)
	api.wait(t, 1)
	cancel()
	<-stopped
	api.mu.Lock()
	comp := api.done["run-slow"]
	api.mu.Unlock()
	if comp.Status != "failed" || comp.Error != "timeout" {
		t.Fatalf("got status %q error %q", comp.Status, comp.Error)
	}
	pidText := mustRead(t, filepath.Join(home, "work", "WP-0007", "r2", "author-1-run-slow", "out", "child.pid"))
	pid, err := strconv.Atoi(strings.TrimSpace(pidText))
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for syscall.Kill(pid, 0) == nil {
		if time.Now().After(deadline) {
			t.Fatalf("child %d still alive after timeout", pid)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestShutdownStopsClaimingAndReportsRunningJobs(t *testing.T) {
	home := t.TempDir()
	job := &Job{Run: testRun("run-long", "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64("echo started > out/started; sleep 60")},
	}}
	api, srv := newFakeAPI(t, job)
	d := New(Config{
		API: srv.URL, Token: testToken, Home: home, Parallel: 1, Timeout: time.Minute,
		PollInterval: 20 * time.Millisecond, LogInterval: 20 * time.Millisecond, Grace: 300 * time.Millisecond,
		Runtimes: []string{RuntimeFake}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	started := filepath.Join(home, "work", "WP-0007", "r2", "author-1-run-long", "out", "started")
	for i := 0; i < 200; i++ {
		if _, err := os.Stat(started); err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	select {
	case <-stopped:
	case <-time.After(10 * time.Second):
		t.Fatal("daemon did not stop")
	}
	api.mu.Lock()
	defer api.mu.Unlock()
	if c, ok := api.done["run-long"]; !ok || c.Status != "failed" || c.Error != "daemon shutdown" {
		t.Fatalf("completion %+v ok=%v", c, ok)
	}
}

func TestTokenFromFileAndChildEnv(t *testing.T) {
	home := t.TempDir()
	get := func(string) string { return "" }
	if _, err := Token(get, home); err == nil || strings.Contains(err.Error(), testToken) {
		t.Fatalf("missing token should error without content: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, "daemon.token"), []byte(testToken+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if tok, err := Token(get, home); err != nil || tok != testToken {
		t.Fatalf("token %q err %v", tok, err)
	}
	env := ChildEnv([]string{"PATH=/bin", "CONTROLROD_DAEMON_TOKEN=" + testToken, "CONTROLROD_API=x", "HOME=/h"})
	if !slices.Equal(env, []string{"PATH=/bin", "HOME=/h"}) {
		t.Errorf("child env %v", env)
	}
	if got := Detect(func(string) (string, error) { return "", errors.New("no") }, get); len(got) != 0 {
		t.Errorf("fake offered without CONTROLROD_ALLOW_FAKE: %v", got)
	}
}
