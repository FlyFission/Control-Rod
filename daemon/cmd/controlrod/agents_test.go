package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

func outdated() []agentupdate.Status {
	grok := agentupdate.Catalog[4]
	oc := agentupdate.Catalog[3]
	return []agentupdate.Status{
		{Agent: grok, Installed: "1.0.77", Latest: "1.0.92", Command: []string{"npm", "install", "--global", "@xai-official/grok@1.0.92"}},
		{Agent: oc, Installed: "1.19.5", Latest: "1.19.6", Command: []string{"npm", "install", "--global", "opencode-ai@1.19.6"}},
	}
}

type recorder struct{ ran []string }

func (r *recorder) run(name string, args []string) error {
	r.ran = append(r.ran, name+" "+strings.Join(args, " "))
	return nil
}

func TestUpdateRunsNothingWithoutYes(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	code := update(&out, strings.NewReader("n\n\n"), outdated(), nil, false, false, true, r.run)
	if code != 0 || len(r.ran) != 0 {
		t.Fatalf("ran %v without a yes (exit %d)", r.ran, code)
	}
	if !strings.Contains(out.String(), "will run: npm install --global @xai-official/grok@1.0.92") {
		t.Fatalf("the command was not shown before asking:\n%s", out.String())
	}
}

func TestUpdateOneAgentByName(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	code := update(&out, strings.NewReader("y\n"), outdated(), []string{"opencode"}, false, false, true, r.run)
	if code != 0 || len(r.ran) != 1 || r.ran[0] != "npm install --global opencode-ai@1.19.6" {
		t.Fatalf("exit %d, ran %v", code, r.ran)
	}
}

func TestUpdateAllAsksOnceForExactlyTheShownCommands(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	code := update(&out, strings.NewReader("y\n"), outdated(), nil, true, false, true, r.run)
	if code != 0 || len(r.ran) != 2 || strings.Count(out.String(), "[y/N]") != 1 {
		t.Fatalf("exit %d, ran %v\n%s", code, r.ran, out.String())
	}
}

func TestUpdateRefusesWithoutTerminalOrYes(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	if code := update(&out, strings.NewReader("y\n"), outdated(), nil, true, false, false, r.run); code != 2 || len(r.ran) != 0 {
		t.Fatalf("exit %d, ran %v", code, r.ran)
	}
}

func TestUpdateSkipsAgentWithNoCommand(t *testing.T) {
	sts := outdated()
	sts[1].Command, sts[1].Note = nil, "installed outside npm (/opt/homebrew/bin/opencode); update it with the tool you installed it with"
	var out bytes.Buffer
	r := &recorder{}
	update(&out, strings.NewReader(""), sts, nil, true, true, false, r.run)
	if len(r.ran) != 1 || !strings.Contains(out.String(), "not updated: installed outside npm") {
		t.Fatalf("ran %v\n%s", r.ran, out.String())
	}
}

func TestUpdateCheckOff(t *testing.T) {
	for _, v := range []string{"0", "off", "false", "NO"} {
		if !updateCheckOff(func(string) string { return v }) {
			t.Errorf("%q should turn the check off", v)
		}
	}
	if updateCheckOff(func(string) string { return "" }) {
		t.Error("the check is on by default")
	}
}

// A registry that did not answer, or a CLI that gave no version, is "could not check", never
// "up to date".
func TestCouldNotCheckIsNotUpToDate(t *testing.T) {
	grok := agentupdate.Catalog[4]
	sts := []agentupdate.Status{{Agent: grok, Installed: "1.0.77", Note: "latest version unavailable: timeout"}}
	var out bytes.Buffer
	printStatuses(&out, sts)
	if s := out.String(); strings.Contains(s, "up to date") || !strings.Contains(s, "Grok CLI could not be checked") || !strings.Contains(s, "(could not check)") {
		t.Fatalf("agents:\n%s", s)
	}
	out.Reset()
	r := &recorder{}
	if code := update(&out, strings.NewReader(""), sts, nil, true, true, false, r.run); code != 1 || strings.Contains(out.String(), "up to date") || len(r.ran) != 0 {
		t.Fatalf("agents update: code %d, ran %v:\n%s", code, r.ran, out.String())
	}
}

// With no agent found, or only one Control Rod cannot look up (Antigravity), nothing claims the
// agents are up to date; Antigravity is listed as not checked.
func TestNoCheckableAgentIsNotUpToDate(t *testing.T) {
	agy := agentupdate.Catalog[2]
	for _, sts := range [][]agentupdate.Status{nil, {{Agent: agy, Installed: "1.4.0"}}} {
		var out bytes.Buffer
		printStatuses(&out, sts)
		s := out.String()
		if strings.Contains(s, "up to date") || !strings.Contains(s, "No ") {
			t.Fatalf("agents:\n%s", s)
		}
		if len(sts) > 0 && !strings.Contains(s, "1.4.0 (not checked)") {
			t.Fatalf("agy not marked:\n%s", s)
		}
		out.Reset()
		r := &recorder{}
		if code := update(&out, strings.NewReader(""), sts, nil, true, true, false, r.run); code != 0 || strings.Contains(out.String(), "up to date") || !strings.Contains(out.String(), "No agent CLI found") || len(r.ran) != 0 {
			t.Fatalf("agents update: code %d, ran %v:\n%s", code, r.ran, out.String())
		}
	}
}
