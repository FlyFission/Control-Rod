package runner

import (
	"context"
	"strings"
)

// RuntimeCheck is one runtime as the daemon would find it at startup, for `controlrod runtimes`.
type RuntimeCheck struct {
	Runtime string
	Name    string
	Ready   bool
	Version string
	Reason  string
	// Note is a non-blocking remark, such as a version newer than tested.
	Note string
	// SwitchedOff are features this version turns on that runs switch off (RuntimeStatus.SwitchedOff).
	SwitchedOff []string
	// NotYet marks a runtime that is detected but never started until its sandbox is built.
	NotYet bool
}

// CheckRuntimes runs the same probe and preflight the daemon runs at startup, with its defaults.
func CheckRuntimes(ctx context.Context, runtimes []string) []RuntimeCheck {
	out := make([]RuntimeCheck, 0, len(runtimes))
	for _, rt := range runtimes {
		st := Probe(ctx, rt, "", ExecRunner)
		if st.Ready {
			off, err := PreflightSwitches(preflightContext(ctx, st), rt, ExecRunner, LookPathAgent, CodexEffectiveFeatures, ManagedCodexConfig())
			if err != nil {
				st.Ready, st.Reason = false, err.Error()
			} else {
				st.SwitchedOff = off
			}
		}
		out = append(out, RuntimeCheck{Runtime: rt, Name: displayName(rt), Ready: st.Ready, Version: st.Version,
			Reason: strings.TrimRight(st.Reason, "."), SwitchedOff: st.SwitchedOff, Note: st.Note, NotYet: !st.Ready && awaitingConfinement(rt)})
	}
	return out
}
