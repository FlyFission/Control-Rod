// Package agentupdate finds agent CLIs with a newer release and, only when the person asks,
// runs the package-manager command that installs it.
//
// The idea (a startup notice listing each agent's installed and latest version, with a per-agent
// and an "update all" action) comes from Orchestrator (agent-orchestrator, Apache-2.0); no code was
// copied. See THIRD_PARTY_NOTICES.md.
//
// Rules this package keeps (change record .nuclear/changes/agent-update-prompt/):
//   - A check runs when the daemon starts or when the person runs `controlrod agents`, never on
//     a timer.
//   - Nothing is installed without the person's yes. The exact command is shown before it runs.
//   - Only a CLI installed by npm, from the package this catalog names, gets a command; anything
//     else is reported with its path and left to the tool that installed it.
//   - The latest version is checked against a strict version pattern before it reaches a command.
package agentupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Agent is one built-in agent CLI and the npm package it is published as. Package is empty when
// Control Rod knows no public package for it, so no latest version is looked up.
type Agent struct {
	ID      string
	Name    string
	Binary  string
	Package string
}

// Catalog lists the built-in agents, in the order Control Rod shows them.
var Catalog = []Agent{
	{ID: "claude", Name: "Claude Code", Binary: "claude", Package: "@anthropic-ai/claude-code"},
	{ID: "codex", Name: "Codex CLI", Binary: "codex", Package: "@openai/codex"},
	{ID: "agy", Name: "Antigravity CLI", Binary: "agy"},
	{ID: "opencode", Name: "OpenCode", Binary: "opencode", Package: "opencode-ai"},
	{ID: "grok", Name: "Grok CLI", Binary: "grok", Package: "@xai-official/grok"},
}

// Status is what a check found for one installed agent.
type Status struct {
	Agent     Agent
	Path      string   // the executable, symlinks resolved
	Installed string   // version from `<binary> --version`, empty if it did not answer
	Latest    string   // latest published version, empty if unknown
	Command   []string // the command that installs Latest; nil when Control Rod will not run one
	Note      string   // why there is no command, or why the check is incomplete
}

// Outdated reports whether a newer version is published than the one installed.
func (s Status) Outdated() bool {
	return s.Installed != "" && s.Latest != "" && Newer(s.Latest, s.Installed)
}

// Incomplete reports whether the check could not compare versions: the CLI gave no version, or a
// package is known but its latest version could not be read. Such a status is neither current nor
// outdated, and is reported as "could not check".
func (s Status) Incomplete() bool {
	return s.Installed == "" || (s.Agent.Package != "" && s.Latest == "")
}

// Env is what a check reads from the host. Tests replace every field.
type Env struct {
	LookPath     func(string) (string, error)
	EvalSymlinks func(string) (string, error)
	// Version runs `<path> --version` and returns its output.
	Version func(ctx context.Context, path string) (string, error)
	// Latest returns the latest published version of an npm package.
	Latest func(ctx context.Context, pkg string) (string, error)
	// NpmRoot returns npm's global node_modules folder (`npm root -g`). nil or an error means no
	// install is offered: only a CLI npm installed globally is updated with npm.
	NpmRoot func(ctx context.Context) (string, error)
}

// semverRe finds x.y.z with any prerelease, whole: "1.2.3--" is the prerelease "-", not 1.2.3.
var semverRe = regexp.MustCompile(`\b(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`)

// strictVersion is the only shape a version may have before it is put into a command: SemVer 2.0
// (no leading zeros, no empty or leading-zero numeric prerelease identifiers) without build
// metadata, which npm does not install by.
var strictVersion = regexp.MustCompile(`^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})` +
	`(-(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$`)

// StrictVersion reports whether v may be put into an install command.
func StrictVersion(v string) bool { return len(v) <= 64 && strictVersion.MatchString(v) }

// ParseVersion returns the first x.y.z[-pre] in s, or "".
func ParseVersion(s string) string {
	return semverRe.FindString(s)
}

// Newer reports whether version a has higher SemVer 2.0 precedence than b (section 11): major,
// minor and patch numerically; a prerelease is lower than its release; two prereleases compare
// identifier by identifier, numeric ones numerically and below alphanumeric ones, which compare in
// ASCII order, and a shorter list of equal identifiers is lower.
func Newer(a, b string) bool {
	ma, mb := semverRe.FindStringSubmatch(a), semverRe.FindStringSubmatch(b)
	if ma == nil || mb == nil {
		return false
	}
	for i := 1; i <= 3; i++ {
		x, _ := strconv.Atoi(ma[i])
		y, _ := strconv.Atoi(mb[i])
		if x != y {
			return x > y
		}
	}
	pa, pb := strings.TrimPrefix(ma[4], "-"), strings.TrimPrefix(mb[4], "-")
	switch {
	case pa == pb:
		return false
	case pa == "":
		return true
	case pb == "":
		return false
	}
	ia, ib := strings.Split(pa, "."), strings.Split(pb, ".")
	for i := 0; i < len(ia) && i < len(ib); i++ {
		if c := compareIdent(ia[i], ib[i]); c != 0 {
			return c > 0
		}
	}
	return len(ia) > len(ib)
}

// compareIdent orders two prerelease identifiers: -1, 0 or 1. Numeric identifiers of any length
// compare by length, then digit by digit (SemVer numerics have no leading zeros).
func compareIdent(x, y string) int {
	dx, dy := allDigits(x), allDigits(y)
	switch {
	case dx && dy:
		if len(x) != len(y) {
			if len(x) < len(y) {
				return -1
			}
			return 1
		}
		return strings.Compare(x, y)
	case dx:
		return -1 // numeric identifiers are lower than alphanumeric ones
	case dy:
		return 1
	}
	return strings.Compare(x, y)
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// Check looks at every agent in the catalog that is on PATH. Agents not installed are left out.
func Check(ctx context.Context, env Env, agents []Agent) []Status {
	out := []Status{}
	npmRoot := ""
	if env.NpmRoot != nil {
		if r, err := env.NpmRoot(ctx); err == nil && filepath.IsAbs(strings.TrimSpace(r)) {
			npmRoot = strings.TrimSpace(r)
			if real, rerr := env.EvalSymlinks(npmRoot); rerr == nil {
				npmRoot = real
			}
		}
	}
	for _, a := range agents {
		p, err := env.LookPath(a.Binary)
		if err != nil {
			continue
		}
		if real, rerr := env.EvalSymlinks(p); rerr == nil {
			p = real
		}
		st := Status{Agent: a, Path: p}
		if v, verr := env.Version(ctx, p); verr == nil {
			st.Installed = ParseVersion(v)
		}
		if st.Installed == "" {
			st.Note = fmt.Sprintf("`%s --version` gave no version", a.Binary)
		}
		if a.Package == "" {
			st.Note = "no public package is known, so the latest version is not checked; update it with the tool you installed it with"
			out = append(out, st)
			continue
		}
		latest, lerr := env.Latest(ctx, a.Package)
		switch {
		case lerr != nil:
			st.Note = "latest version unavailable: " + lerr.Error()
		case !StrictVersion(latest):
			st.Note = "the registry answered with something that is not a version"
		default:
			st.Latest = latest
		}
		if st.Latest != "" && npmGlobal(p, npmRoot, a.Package) {
			st.Command = []string{"npm", "install", "--global", a.Package + "@" + st.Latest}
		} else if st.Latest != "" {
			st.Note = fmt.Sprintf("installed outside npm (%s); update it with the tool you installed it with", p)
		}
		out = append(out, st)
	}
	return out
}

// npmGlobal reports whether the resolved executable lies inside npm's global node_modules, in the
// package's own folder, so `npm install --global` replaces exactly it. A project-local, pnpm or
// other-prefix copy, Homebrew or a native installer is not touched.
func npmGlobal(path, npmRoot, pkg string) bool {
	if npmRoot == "" {
		return false
	}
	prefix := filepath.ToSlash(filepath.Clean(npmRoot)) + "/" + pkg + "/"
	return strings.HasPrefix(filepath.ToSlash(filepath.Clean(path)), prefix)
}

// Outdated returns the statuses with a newer version published.
func Outdated(sts []Status) []Status {
	out := []Status{}
	for _, s := range sts {
		if s.Outdated() {
			out = append(out, s)
		}
	}
	return out
}

// DefaultRegistry is npm's public registry. CONTROLROD_NPM_REGISTRY replaces it (a mirror).
const DefaultRegistry = "https://registry.npmjs.org"

// RegistryLatest returns a Latest function that asks an npm registry for a package's latest tag.
func RegistryLatest(client *http.Client, registry string) func(context.Context, string) (string, error) {
	if registry == "" {
		registry = DefaultRegistry
	}
	registry = strings.TrimRight(registry, "/")
	return func(ctx context.Context, pkg string) (string, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, registry+"/"+url.PathEscape(pkg)+"/latest", nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("Accept", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("registry answered %s", resp.Status)
		}
		var body struct {
			Version string `json:"version"`
		}
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
			return "", err
		}
		if body.Version == "" {
			return "", errors.New("registry gave no version")
		}
		return body.Version, nil
	}
}

// CheckTimeout bounds one whole check, so a slow registry never holds up the daemon.
const CheckTimeout = 8 * time.Second

// Summary is the one-line notice the daemon logs at startup, or "" when nothing is outdated.
func Summary(sts []Status) string {
	out := Outdated(sts)
	if len(out) == 0 {
		return ""
	}
	parts := make([]string, 0, len(out))
	for _, s := range out {
		parts = append(parts, fmt.Sprintf("%s %s -> %s", s.Agent.Name, s.Installed, s.Latest))
	}
	noun := "updates"
	if len(out) == 1 {
		noun = "update"
	}
	return fmt.Sprintf("%d agent %s: %s. Run `controlrod agents update` to review and install.", len(out), noun, strings.Join(parts, ", "))
}
