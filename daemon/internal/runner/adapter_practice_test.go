package runner

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// The bundled sample project the control plane copies for the practice project, and the committed
// outputs the practice routines give for it. The control plane's practice loop test
// (services/api/test/practice.test.ts) submits these same files, so the two sides stay one loop.
var (
	practiceSample = filepath.Join("..", "..", "..", "services", "api", "practice", "sample-project")
	practiceGolden = filepath.Join("..", "..", "..", "tests", "e2e", "practice")
)

func practiceRun(id, role string) Run {
	rt := RuntimePractice
	if role == "pre-check" {
		rt = RuntimePracticeCheck
	}
	return Run{ID: id, PackageID: "C-PRACTICE-README", PackageRevision: 0, Role: role, Round: 1,
		AgentBaseline: "author-" + rt, Runtime: RuntimeRef{Kind: "local", Provider: rt, Model: rt}}
}

func practiceDaemon(t *testing.T) *Daemon {
	t.Helper()
	old := practicePace
	practicePace = 0
	t.Cleanup(func() { practicePace = old })
	return New(Config{API: "http://127.0.0.1:1", Token: testToken, Home: t.TempDir(), Timeout: time.Minute,
		Runtimes: []string{RuntimePractice, RuntimePracticeCheck}, Version: "test",
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
}

func sampleFile(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(practiceSample, name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func in(name string, b []byte) NamedFile {
	return NamedFile{Name: name, ContentBase64: base64.StdEncoding.EncodeToString(b)}
}

// checkGolden compares a completion's outputs with the committed files for a role. With
// CONTROLROD_UPDATE_PRACTICE_GOLDEN=1 it writes them instead.
func checkGolden(t *testing.T, role string, comp Completion) map[string][]byte {
	t.Helper()
	got := map[string][]byte{}
	for _, o := range comp.Outputs {
		b, err := base64.StdEncoding.DecodeString(o.ContentBase64)
		if err != nil {
			t.Fatal(err)
		}
		got[o.Name] = b
	}
	dir := filepath.Join(practiceGolden, role)
	if os.Getenv("CONTROLROD_UPDATE_PRACTICE_GOLDEN") == "1" {
		_ = os.RemoveAll(dir)
		for name, b := range got {
			p := filepath.Join(dir, filepath.FromSlash(name))
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(p, b, 0o644); err != nil {
				t.Fatal(err)
			}
		}
		return got
	}
	want := map[string][]byte{}
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		b, rerr := os.ReadFile(p)
		want[filepath.ToSlash(rel)] = b
		return rerr
	})
	if err != nil {
		t.Fatalf("read %s: %v (CONTROLROD_UPDATE_PRACTICE_GOLDEN=1 writes it)", dir, err)
	}
	if len(got) != len(want) {
		t.Fatalf("%s outputs %v, committed %v", role, keys(got), keys(want))
	}
	for name, b := range want {
		if string(got[name]) != string(b) {
			t.Fatalf("%s %s differs from %s\n got %s\nwant %s", role, name, dir, got[name], b)
		}
	}
	return got
}

func keys(m map[string][]byte) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

func TestPracticeLoopRunsEveryRoleWithoutAProcess(t *testing.T) {
	d := practiceDaemon(t)
	readme := sampleFile(t, "README.md")
	brief := []byte("## The request\n\n[project-id:prj_x]\nPractice card.\n")

	intake := d.Execute(context.Background(), &Job{Run: practiceRun("run-p-intake", "intake"), Inputs: []NamedFile{
		in("BRIEF.md", brief), in("attachments/README.md", readme), in("attachments/hello.py", sampleFile(t, "hello.py")),
	}})
	if intake.Status != "succeeded" {
		t.Fatalf("intake %s: %s", intake.Status, intake.Error)
	}
	plan := checkGolden(t, "intake", intake)
	var pkg map[string]any
	if err := json.Unmarshal(plan["packages/README.json"], &pkg); err != nil {
		t.Fatalf("intake package: %v", err)
	}
	if pkg["data_lane"] != "public" || len(pkg["acceptance_criteria"].([]any)) != 3 {
		t.Fatalf("package %v", pkg)
	}

	author := d.Execute(context.Background(), &Job{Run: practiceRun("run-p-author", "author"), Inputs: []NamedFile{
		in("BRIEF.md", []byte("Do the package.")), in("PACKAGE.json", plan["packages/README.json"]), in("attachments/README.md", readme),
	}})
	if author.Status != "succeeded" {
		t.Fatalf("author %s: %s", author.Status, author.Error)
	}
	work := checkGolden(t, "author", author)
	if !strings.HasPrefix(string(work["README.md"]), string(readme[:len(readme)-1])) {
		t.Fatalf("the author changed the original text:\n%s", work["README.md"])
	}

	check := d.Execute(context.Background(), &Job{Run: practiceRun("run-p-check", "pre-check"), Inputs: []NamedFile{
		in("BRIEF.md", []byte("Check it.")), in("deliverables/README.md", work["README.md"]), in("deliverables/PRACTICE.md", work["PRACTICE.md"]),
	}})
	if check.Status != "succeeded" {
		t.Fatalf("check %s: %s", check.Status, check.Error)
	}
	checkGolden(t, "pre-check", check)
	var v struct {
		Outcome  string `json:"outcome"`
		Findings []any  `json:"findings"`
	}
	if err := json.Unmarshal(check.Verification, &v); err != nil || v.Outcome != "pass" || v.Findings == nil || len(v.Findings) != 0 {
		t.Fatalf("verification %s (%v)", check.Verification, err)
	}

	for _, c := range []struct {
		comp Completion
		rt   string
	}{{intake, RuntimePractice}, {author, RuntimePractice}, {check, RuntimePracticeCheck}} {
		tr := c.comp.Trace
		if tr == nil || tr.RuntimeMode != "practice" || tr.Sandbox != "none" || tr.Tool.Name != c.rt || tr.Tool.Digest != nil || tr.RequestedModel != "none" {
			t.Fatalf("trace %+v", tr)
		}
		if c.comp.Containment != "none" || c.comp.Receipt != nil || c.comp.Attestation != nil {
			t.Fatalf("a practice run reported a process: %+v", c.comp)
		}
		validate(t, compileSchema(t, "ExecutionTrace.json"), tr)
		if len(c.comp.Events) == 0 || c.comp.Events[0].Kind != EvNotice || c.comp.Events[0].Text != PracticeNotice {
			t.Fatalf("first event is not the practice notice: %+v", c.comp.Events)
		}
	}
}

func TestPracticeCheckerFailsWorkThatMissesTheCriteria(t *testing.T) {
	d := practiceDaemon(t)
	for _, c := range []struct {
		name   string
		inputs []NamedFile
		ids    []string
	}{
		{"no README", nil, []string{"F-001"}},
		{"no section", []NamedFile{in("deliverables/README.md", []byte("# Greeter\n\nHi.\n"))}, []string{"F-001"}},
		{"no command", []NamedFile{in("deliverables/README.md", []byte("# Greeter\n\n## Getting started\n\nRun it.\n\n## Later\n\npython3 hello.py\n"))}, []string{"F-002"}},
		{"title gone", []NamedFile{in("deliverables/README.md", []byte("## Getting started\n\npython3 hello.py\n"))}, []string{"F-003"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			comp := d.Execute(context.Background(), &Job{Run: practiceRun("run-p-"+strings.ReplaceAll(c.name, " ", "-"), "pre-check"),
				Inputs: append([]NamedFile{in("BRIEF.md", []byte("Check it."))}, c.inputs...)})
			var v struct {
				Outcome  string `json:"outcome"`
				Findings []struct {
					ID string `json:"id"`
				} `json:"findings"`
			}
			if err := json.Unmarshal(comp.Verification, &v); err != nil || comp.Status != "succeeded" || v.Outcome != "fail" {
				t.Fatalf("%s %s %s", comp.Status, comp.Error, comp.Verification)
			}
			var ids []string
			for _, f := range v.Findings {
				ids = append(ids, f.ID)
			}
			if !slices.Equal(ids, c.ids) {
				t.Fatalf("findings %v, want %v", ids, c.ids)
			}
		})
	}
}

func TestPracticeRefusesACheckoutAndAnotherRole(t *testing.T) {
	ws := &Workspace{Dir: t.TempDir()}
	ws.Inputs, ws.Out = filepath.Join(ws.Dir, "inputs"), filepath.Join(ws.Dir, "out")
	run := practiceRun("run-p-co", "author")
	run.Checkout = &CheckoutBinding{}
	if err := practiceAuthor.RunPractice(context.Background(), run, ws, func([]Event) {}); err == nil || !strings.Contains(err.Error(), "never touch a repository") {
		t.Fatalf("checkout: %v", err)
	}
	if err := practiceAuthor.RunPractice(context.Background(), practiceRun("run-p-x", "pre-check"), ws, func([]Event) {}); err == nil {
		t.Fatal("the practice author ran a pre-check")
	}
	if err := practiceChecker.RunPractice(context.Background(), practiceRun("run-p-y", "author"), ws, func([]Event) {}); err == nil {
		t.Fatal("the practice checker authored")
	}
	if _, err := os.Stat(ws.Out); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("a refused practice run wrote out/: %v", err)
	}
}

func TestPracticeStopsWhenTheRunIsStopped(t *testing.T) {
	old := practicePace
	practicePace = time.Hour
	t.Cleanup(func() { practicePace = old })
	ws := &Workspace{Dir: t.TempDir()}
	ws.Inputs, ws.Out = filepath.Join(ws.Dir, "inputs"), filepath.Join(ws.Dir, "out")
	ctx, cancel := context.WithCancelCause(context.Background())
	stop := errors.New("stopped by the owner")
	go func() { time.Sleep(20 * time.Millisecond); cancel(stop) }()
	if err := practiceAuthor.RunPractice(ctx, practiceRun("run-p-stop", "author"), ws, func([]Event) {}); !errors.Is(err, stop) {
		t.Fatalf("got %v", err)
	}
}

func TestStandaloneCheckNeverUsesThePracticeChecker(t *testing.T) {
	if _, _, err := resolveCheckerRuntime(context.Background(), CheckConfig{CheckerRuntime: RuntimePracticeCheck}, RuntimeClaude); !errors.Is(err, ErrCheckUsage) || !strings.Contains(err.Error(), "practice project") {
		t.Fatalf("explicit practice checker: %v", err)
	}
	nothing := func(string) (string, error) { return "", errors.New("missing") }
	_, _, err := resolveCheckerRuntime(context.Background(), CheckConfig{LookPath: nothing, Getenv: func(string) string { return "" }}, RuntimeClaude)
	if err == nil || strings.Contains(err.Error(), "practice") {
		t.Fatalf("with only the practice runtimes on the machine the check must find no checker, and not name them: %v", err)
	}
	if RuntimeFamily(RuntimePractice) != "" || RuntimeFamily(RuntimePracticeCheck) != "" {
		t.Fatal("a practice runtime has a vendor family, so a standalone check could count it")
	}
}
