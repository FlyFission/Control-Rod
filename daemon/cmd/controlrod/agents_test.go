package main

import (
	"bytes"
	"errors"
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
	code := update(&out, strings.NewReader("n\n\n"), outdated(), nil, false, false, true, noLock, r.run)
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
	code := update(&out, strings.NewReader("y\n"), outdated(), []string{"opencode"}, false, false, true, noLock, r.run)
	if code != 0 || len(r.ran) != 1 || r.ran[0] != "npm install --global opencode-ai@1.19.6" {
		t.Fatalf("exit %d, ran %v", code, r.ran)
	}
}

func TestUpdateAllAsksOnceForExactlyTheShownCommands(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	code := update(&out, strings.NewReader("y\n"), outdated(), nil, true, false, true, noLock, r.run)
	if code != 0 || len(r.ran) != 2 || strings.Count(out.String(), "[y/N]") != 1 {
		t.Fatalf("exit %d, ran %v\n%s", code, r.ran, out.String())
	}
}

func TestUpdateRefusesWithoutTerminalOrYes(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	if code := update(&out, strings.NewReader("y\n"), outdated(), nil, true, false, false, noLock, r.run); code != 2 || len(r.ran) != 0 {
		t.Fatalf("exit %d, ran %v", code, r.ran)
	}
}

func TestUpdateSkipsAgentWithNoCommand(t *testing.T) {
	sts := outdated()
	sts[1].Command, sts[1].Note = nil, "installed outside npm (/opt/homebrew/bin/opencode); update it with the tool you installed it with"
	var out bytes.Buffer
	r := &recorder{}
	update(&out, strings.NewReader(""), sts, nil, true, true, false, noLock, r.run)
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

func noLock() (func(), error) { return func() {}, nil }

// While a daemon holds its home, a local update runs nothing: the daemon may be using the CLI.
func TestUpdateRunsNothingWhileADaemonHoldsItsHome(t *testing.T) {
	var out bytes.Buffer
	r := &recorder{}
	held := func() (func(), error) {
		return nil, errors.New("another Control Rod daemon is already running with home /h/.controlrod; stop it first")
	}
	code := update(&out, strings.NewReader("y\n"), outdated(), nil, true, false, true, held, r.run)
	if code != 1 || len(r.ran) != 0 || !strings.Contains(out.String(), "agent updates card") {
		t.Fatalf("code %d, ran %v:\n%s", code, r.ran, out.String())
	}
}
