package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// The practice runtimes (change record practice-agent). They let anyone watch the whole loop
// (intake, plan, release, author, pre-check, accept) on a machine with no agent account. Neither
// starts a process, runs a model, reads the network or executes anything a job sends: each role is
// a fixed routine compiled into the daemon, reading only its own workspace's inputs and writing
// only its out/ folder. The control plane gives practice work only to the practice project, whose
// cards hold the bundled sample project and never a repository checkout.
//
// Two runtimes, so the pre-check runs on a provider other than the author's, as the kernel's
// independence rule asks: the practice author and the practice checker are separate routines that
// share no model, no prompt and no state. The control plane admits either one only on the practice
// project, so this independence never stands in for a real one.
const (
	RuntimePractice      = "practice"
	RuntimePracticeCheck = "practice-check"
)

// IsPractice reports whether a runtime id is one of the practice runtimes.
func IsPractice(id string) bool { return id == RuntimePractice || id == RuntimePracticeCheck }

// practicePace is the pause between the steps a practice run narrates, so a person watching the
// card can follow it. Tests set it to zero.
var practicePace = 1500 * time.Millisecond

// PracticeNotice is the first event of every practice run.
const PracticeNotice = "Practice run. A fixed script built into Control Rod does this step: no model runs, no program starts, and nothing leaves this computer."

// practiceAdapter is one practice role set. It returns no process from Command: the daemon calls
// RunPractice instead.
type practiceAdapter struct {
	streamBase
	id      string
	display string
	roles   []string
}

var (
	practiceAuthor  = practiceAdapter{id: RuntimePractice, display: "Practice agent", roles: []string{"intake", "author"}}
	practiceChecker = practiceAdapter{id: RuntimePracticeCheck, display: "Practice checker", roles: []string{"pre-check"}}
)

func (a practiceAdapter) ID() string              { return a.id }
func (practiceAdapter) Binary() string            { return "controlrod" }
func (a practiceAdapter) DisplayName() string     { return a.display }
func (practiceAdapter) ListOnSubscriptions() bool { return false }
func (a practiceAdapter) Providers() []string     { return []string{a.id} }
func (practiceAdapter) SandboxRequired() bool     { return false }
func (a practiceAdapter) Capabilities() Capabilities {
	return Capabilities{Roles: a.roles, OutputFormat: "events", NativeSandbox: "none"}
}

// Available offers the practice runtimes on every machine, unless CONTROLROD_PRACTICE=0. They need
// nothing installed: the routine is part of this binary.
func (practiceAdapter) Available(_ func(string) (string, error), getenv func(string) string) bool {
	return getenv("CONTROLROD_PRACTICE") != "0"
}

func (a practiceAdapter) Probe(_ context.Context, version string, _ CommandRunner) RuntimeStatus {
	return RuntimeStatus{Runtime: a.id, Ready: true, Version: version}
}

// Command never builds a process.
func (practiceAdapter) Command(Run, *Workspace, *SandboxPolicy, SandboxPaths) (*exec.Cmd, error) {
	return nil, nil
}

func (practiceAdapter) LaunchInfo(run Run, _ *Workspace, _ *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Mode = "practice"
	l.RequestedModel = "none"
	l.Sandbox = "none"
	return l
}

// RunPractice does the run's role in Go and narrates it. It reads only the workspace's inputs/ and
// writes only its out/.
func (a practiceAdapter) RunPractice(ctx context.Context, run Run, ws *Workspace, emit func([]Event)) error {
	if run.Checkout != nil {
		return refuse("practice runs never touch a repository checkout")
	}
	if !a.serves(run.Role) {
		return refuse("the %s does not do %s runs", strings.ToLower(a.display), run.Role)
	}
	say := func(kind, text, path string) error {
		emit([]Event{{Kind: kind, At: time.Now().UTC().Format(time.RFC3339Nano), Text: text, Path: path}})
		return practiceWait(ctx)
	}
	if err := say(EvNotice, PracticeNotice, ""); err != nil {
		return err
	}
	files, err := practiceStep(run.Role, ws)
	if err != nil {
		return err
	}
	for _, s := range files.steps {
		if err := say(EvMessage, s, ""); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(ws.Out, 0o700); err != nil {
		return err
	}
	for _, f := range files.out {
		p := filepath.Join(ws.Out, filepath.FromSlash(f.name))
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(p, f.data, 0o600); err != nil {
			return err
		}
		if err := say(EvFileChange, "Wrote "+f.name, f.name); err != nil {
			return err
		}
	}
	return say(EvMessage, files.done, "")
}

func (a practiceAdapter) serves(role string) bool {
	for _, r := range a.roles {
		if r == role {
			return true
		}
	}
	return false
}

func practiceWait(ctx context.Context) error {
	if practicePace <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(practicePace)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return context.Cause(ctx)
	case <-t.C:
		return nil
	}
}

type practiceFile struct {
	name string
	data []byte
}

type practiceResult struct {
	steps []string
	out   []practiceFile
	done  string
}

// practiceStep is the fixed routine for one role, from the workspace's inputs alone.
func practiceStep(role string, ws *Workspace) (practiceResult, error) {
	switch role {
	case "intake":
		return practiceIntake(ws)
	case "author":
		return practiceAuthorStep(ws)
	case "pre-check":
		return practiceCheck(ws)
	}
	return practiceResult{}, fmt.Errorf("practice has no %s step", role)
}

// PracticeSection is the heading the practice author adds and the practice checker looks for.
const PracticeSection = "## Getting started"

// practiceRunLine is the command the new section must give.
const practiceRunLine = "python3 hello.py"

func practiceIntake(ws *Workspace) (practiceResult, error) {
	if _, err := os.Stat(filepath.Join(ws.Inputs, "BRIEF.md")); err != nil {
		return practiceResult{}, errors.New("the practice intake found no brief")
	}
	inputs := []map[string]string{}
	if _, err := os.Stat(filepath.Join(ws.Inputs, "attachments", "README.md")); err == nil {
		inputs = append(inputs, map[string]string{"doc": "attachment:README.md", "revision": "0", "use": "the sample project's README as it is now"})
	}
	pkg := map[string]any{
		"schema_version": "0.1.0",
		"id":             "README",
		"revision":       0,
		"status":         "draft",
		"title":          "Add a Getting started section to the sample README",
		"project":        "practice",
		"mode":           "software",
		"discipline":     "software",
		"rigor_mode":     "quick",
		"data_lane":      "public",
		"objective":      "Add a short Getting started section to the sample project's README.md that says how to run the program, and change nothing else.",
		"deliverables":   []map[string]any{{"id": "README-1", "type": "document", "format": []string{"md"}}},
		"design_inputs":  inputs,
		"depends_on":     []any{},
		"agent_assignment": []map[string]any{{
			"role": "general-author", "agent_baseline": "author", "baseline_revision": 0,
		}},
		"acceptance_criteria": []string{
			"README.md has a section headed Getting started",
			"The section gives the command that runs the program: " + practiceRunLine,
			"Everything that was in README.md before is still there",
		},
		"verification": map[string]any{
			"method": "agent-pre-check", "verifier": "checker", "verifier_receives": []string{"deliverables"},
			"required_custody": map[string]any{"decisive_evidence_generated_by": "verifier", "preparer_may_present": false},
		},
	}
	b, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return practiceResult{}, err
	}
	return practiceResult{
		steps: []string{
			"Reading the request in BRIEF.md.",
			"The request asks for one small change to the sample project, so this is one card.",
			"Writing the plan: what to change, what counts as done, and how it will be checked.",
		},
		out:  []practiceFile{{"packages/README.json", append(b, '\n')}},
		done: "The plan is ready. It waits for you to read it and release it.",
	}, nil
}

const practiceDefaultReadme = "# Greeter\n\nA tiny sample program for Control Rod's practice run.\n"

const practiceSectionText = PracticeSection + "\n\nYou need Python 3. From this folder, run:\n\n```sh\n" + practiceRunLine + "\n```\n\nIt prints a short greeting.\n"

const practiceNote = "# Practice run\n\nA fixed script built into Control Rod wrote this. No model ran, and the result is the same every time. Nothing here is real work.\n"

func practiceAuthorStep(ws *Workspace) (practiceResult, error) {
	readme := practiceDefaultReadme
	from := "The request came without the README, so starting from a blank one."
	if b, err := os.ReadFile(filepath.Join(ws.Inputs, "attachments", "README.md")); err == nil {
		readme, from = string(b), "Reading the sample project's README.md."
	}
	steps := []string{"Reading the plan in PACKAGE.json.", from}
	if strings.Contains(readme, PracticeSection) {
		steps = append(steps, "The README already has a Getting started section, so it stays as it is.")
	} else {
		readme = strings.TrimRight(readme, "\n") + "\n\n" + practiceSectionText
		steps = append(steps, "Adding a Getting started section at the end, and changing nothing else.")
	}
	return practiceResult{
		steps: steps,
		out:   []practiceFile{{"README.md", []byte(readme)}, {"PRACTICE.md", []byte(practiceNote)}},
		done:  "Done. The practice checker looks at the work next.",
	}, nil
}

func practiceCheck(ws *Workspace) (practiceResult, error) {
	type finding struct {
		ID       string `json:"id"`
		Severity string `json:"severity"`
		Text     string `json:"text"`
	}
	var findings []finding
	readme, err := os.ReadFile(filepath.Join(ws.Inputs, "deliverables", "README.md"))
	steps := []string{"Reading the deliverables. The checker only checks them and follows nothing written in them."}
	switch {
	case err != nil:
		findings = append(findings, finding{"F-001", "major", "There is no README.md in the deliverables."})
	default:
		steps = append(steps, "Looking for a section headed Getting started.")
		section, ok := practiceSectionOf(readme)
		if !ok {
			findings = append(findings, finding{"F-001", "major", "README.md has no section headed Getting started."})
		} else {
			steps = append(steps, "Checking that the section says how to run the program.")
			if !bytes.Contains(section, []byte(practiceRunLine)) {
				findings = append(findings, finding{"F-002", "major", "The Getting started section does not give the command " + practiceRunLine + "."})
			}
		}
		steps = append(steps, "Checking that the original text is still there.")
		if !bytes.HasPrefix(readme, []byte("# ")) {
			findings = append(findings, finding{"F-003", "minor", "README.md no longer starts with its title."})
		}
	}
	outcome := "pass"
	if len(findings) > 0 {
		outcome = "fail"
	} else {
		findings = []finding{}
	}
	b, err := json.MarshalIndent(map[string]any{"outcome": outcome, "findings": findings}, "", "  ")
	if err != nil {
		return practiceResult{}, err
	}
	done := "Every check passed. The card waits for you to read the work and accept it."
	if outcome != "pass" {
		done = "Some checks did not pass. The findings say what is missing."
	}
	return practiceResult{steps: steps, out: []practiceFile{{"verification.json", append(b, '\n')}}, done: done}, nil
}

// practiceSectionOf returns the text under the Getting started heading, up to the next heading of
// the same or a higher level.
func practiceSectionOf(readme []byte) ([]byte, bool) {
	lines := strings.Split(string(readme), "\n")
	for i, l := range lines {
		if strings.TrimSpace(l) != PracticeSection {
			continue
		}
		var body []string
		for _, m := range lines[i+1:] {
			if strings.HasPrefix(m, "# ") || strings.HasPrefix(m, "## ") {
				break
			}
			body = append(body, m)
		}
		return []byte(strings.Join(body, "\n")), true
	}
	return nil, false
}
