package runner

import (
	"fmt"
	"strconv"
	"strings"
)

// Agent CLI updates are trusted (owner decision, 2026-11-25): a version newer than the one Control
// Rod measured is seated, not refused, with a note that it is newer than tested. What holds every
// run does not depend on the version and stays: the sandbox each adapter builds, and the per-run
// checks that stop a run when a fence did not take (Grok's allowlist proof, Antigravity's result
// check, Codex's feature switches). Only a version older than the measured one, or one that cannot
// be read, is refused.

// agentVersionAtLeast reports whether the first x.y.z in v (agyVersionRE) is tested or newer. A
// prerelease ("1.5.17-beta", "1.0.92.0-rc.1") counts only when its x.y.z is newer than tested, since a
// prerelease of the tested build comes before it; any other suffix ("1.5.16.1", "+build") counts from
// its x.y.z.
func agentVersionAtLeast(v, tested string) (ok, newer bool) {
	m := agyVersionRE.FindStringSubmatch(v)
	if m == nil {
		return false, false
	}
	got, suffix, ok := splitVersion(m[1])
	want, _, wok := splitVersion(tested)
	if !ok || !wok {
		return false, false
	}
	c := compareVersion(got, want)
	// Build metadata ("+build-7") does not order versions; a prerelease marker before it does.
	if pre, _, _ := strings.Cut(suffix, "+"); strings.Contains(pre, "-") {
		// Any prerelease marker, also after a fourth number ("1.0.92.0-rc.1"), counts as before its base.
		return c > 0, c > 0
	}
	return c >= 0, c > 0 || suffix != ""
}

func splitVersion(s string) ([3]int, string, bool) {
	var out [3]int
	rest := s
	for i := range out {
		end := 0
		for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
			end++
		}
		if end == 0 || end > 9 {
			return out, "", false
		}
		out[i], _ = strconv.Atoi(rest[:end])
		rest = rest[end:]
		if i < 2 {
			if !strings.HasPrefix(rest, ".") {
				return out, "", false
			}
			rest = rest[1:]
		}
	}
	return out, rest, true
}

func compareVersion(a, b [3]int) int {
	for i := range a {
		if a[i] != b[i] {
			if a[i] > b[i] {
				return 1
			}
			return -1
		}
	}
	return 0
}

// newerThanTestedNote is the non-blocking note for a seated version newer than the measured one.
func newerThanTestedNote(name, v, tested string) string {
	return fmt.Sprintf("%s %s is newer than the %s Control Rod tested; it is seated, and its sandbox applies as usual.", name, strings.TrimSpace(v), tested)
}
