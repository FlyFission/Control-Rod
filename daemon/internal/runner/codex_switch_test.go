package runner

import (
	"context"
	"errors"
	"os"
	"slices"
	"strings"
	"testing"
)

// codexLister answers like `codex features list`: each feature in base is on unless it was switched
// off, and stuck features stay on whatever is asked.
func codexLister(base string, stuck ...string) CodexFeatureLister {
	return func(_ context.Context, off []string) (string, error) {
		var b strings.Builder
		for _, line := range strings.Split(base, "\n") {
			f := strings.Fields(line)
			if len(f) >= 3 && slices.Contains(off, f[0]) && !slices.Contains(stuck, f[0]) {
				line = strings.TrimSuffix(line, "true") + "false"
			}
			b.WriteString(line + "\n")
		}
		return b.String(), nil
	}
}

// A newer Codex that turns on a feature Control Rod has not qualified stays in work: the feature is
// switched off, and only once Codex reports it off. Every way that could leave it on is refused.
func TestCodexSwitchesOffNewFeaturesInsteadOfRefusing(t *testing.T) {
	ctx := context.Background()
	signedIn := preflightRunner(map[string]int{"codex login status": 0})
	list := "shell_tool stable true\nteleport experimental true\nzeta_mode stable true\nhooks stable false\n"

	off, err := PreflightSwitches(ctx, RuntimeCodex, signedIn, found, codexLister(list), nil)
	if err != nil || !slices.Equal(off, []string{"teleport", "zeta_mode"}) {
		t.Fatalf("switches = %v, %v", off, err)
	}
	// A caller that cannot carry switches to the launch still refuses, so none starts Codex with
	// the feature on.
	if err := Preflight(ctx, RuntimeCodex, signedIn, found, codexLister(list), nil); err == nil || !strings.Contains(err.Error(), "teleport") {
		t.Fatalf("Preflight without switches: %v", err)
	}
	if err := (codexAdapter{features: codexLister(list)}).PreflightCLI(ctx, signedIn); err == nil || !strings.Contains(err.Error(), "teleport") {
		t.Fatalf("PreflightCLI without switches: %v", err)
	}
	// Nothing new: nothing to switch off.
	if off, err := PreflightSwitches(ctx, RuntimeCodex, signedIn, found, codexLister("shell_tool stable true\n"), nil); err != nil || off != nil {
		t.Fatalf("qualified list: %v, %v", off, err)
	}

	refused := map[string]CodexFeatureLister{
		"did not switch it off": codexLister(list, "zeta_mode"),
		"cannot read":           codexLister("shell_tool stable true\nTele-Port stable true\n"),
		"switched off (": func(_ context.Context, off []string) (string, error) {
			if len(off) > 0 {
				return "", errors.New("exit 2")
			}
			return list, nil
		},
	}
	for want, lister := range refused {
		if off, err := PreflightSwitches(ctx, RuntimeCodex, signedIn, found, lister, nil); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want a refusal with %q, got %v, %v", want, off, err)
		}
	}
	// A list that is not a feature list is still refused, not switched off.
	unreadable := codexLister("shell_tool stable true\nsomething else entirely\n")
	if _, err := PreflightSwitches(ctx, RuntimeCodex, signedIn, found, unreadable, nil); err == nil {
		t.Fatal("an unreadable list passed")
	}
}

// Codex 0.172.0's real `features list` (Control Rod's switches applied, no user config), captured
// from the published npm package: it turns on mcp_lazy_stdio_startup, which 0.171.0 left off, and
// is seated with that one feature switched off.
func TestCodex0172IsSeatedWithItsNewFeatureSwitchedOff(t *testing.T) {
	b, err := os.ReadFile("testdata/codex-0.172.0-features.txt")
	if err != nil {
		t.Fatal(err)
	}
	if extra := unqualifiedCodexFeatures(string(b)); !slices.Equal(extra, []string{"mcp_lazy_stdio_startup"}) {
		t.Fatalf("the captured 0.172.0 list leaves on %v", extra)
	}
	signedIn := preflightRunner(map[string]int{"codex login status": 0})
	off, err := PreflightSwitches(context.Background(), RuntimeCodex, signedIn, found, codexLister(string(b)), nil)
	if err != nil || !slices.Equal(off, []string{"mcp_lazy_stdio_startup"}) {
		t.Fatalf("switches = %v, %v", off, err)
	}
}

// Every Codex launch, author and checker alike, carries the switches its preflight found, and only
// names that cannot be read as anything but a feature.
func TestCodexLaunchCarriesTheSwitches(t *testing.T) {
	home := realTempDir(t)
	for _, checker := range []bool{false, true} {
		ws := &Workspace{Dir: realTempDir(t), Checker: checker, CodexSwitchedOff: []string{"mcp_lazy_stdio_startup", "hooks"}}
		if checker {
			ws.Scratch = ws.Dir + "/scratch"
		}
		args, err := CodexArgs(ws, "", testPolicy(), SandboxPaths{Home: home, Workspace: ws.Dir})
		if err != nil {
			t.Fatal(err)
		}
		joined := strings.Join(args, " ")
		if !strings.Contains(joined, "--disable mcp_lazy_stdio_startup") {
			t.Errorf("checker=%v: the switch is missing: %s", checker, joined)
		}
		if strings.Count(joined, "--disable hooks ") != 1 {
			t.Errorf("checker=%v: a fixed switch is passed twice: %s", checker, joined)
		}
		// The prompt stays the last argument.
		if args[len(args)-1] == "mcp_lazy_stdio_startup" {
			t.Errorf("checker=%v: the switch took the prompt's place", checker)
		}
	}
	for _, bad := range []string{"--dangerously-bypass-approvals-and-sandbox", "Shell", "a b", "", CodexSafeFeatures[0]} {
		ws := &Workspace{Dir: realTempDir(t), CodexSwitchedOff: []string{bad}}
		if _, err := CodexArgs(ws, "", testPolicy(), SandboxPaths{Home: home, Workspace: ws.Dir}); err == nil {
			t.Errorf("switch %q was passed", bad)
		}
	}
}

// A probe that lands between building a Codex command and launching it can change the switches; the
// launch is then refused rather than run with a feature left on.
func TestLaunchRefusesSwitchesTheLastPreflightDidNotFind(t *testing.T) {
	sum := Digest{Algorithm: "sha256", Value: strings.Repeat("a", 64)}
	d := &Daemon{status: []RuntimeStatus{{Runtime: RuntimeCodex, Ready: true, Artifact: &RuntimeArtifact{Digest: sum}, SwitchedOff: []string{"teleport"}}}}
	if got := d.switchedOff(RuntimeCodex); !slices.Equal(got, []string{"teleport"}) {
		t.Fatalf("switchedOff = %v", got)
	}
	if err := d.preflightedArtifact(RuntimeCodex, sum, []string{"teleport"}); err != nil {
		t.Fatalf("matching switches: %v", err)
	}
	for _, built := range [][]string{nil, {"other"}, {"teleport", "other"}} {
		if err := d.preflightedArtifact(RuntimeCodex, sum, built); err == nil {
			t.Errorf("a command built with %v launched", built)
		}
	}
}
