package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/runner"
)

// runtimesCheck runs `controlrod runtimes`: the daemon's own probe and sandbox preflight for each
// agent CLI found on PATH, one line each, so `pnpm cr doctor` reports what the daemon will refuse
// before anything starts. It changes nothing.
func runtimesCheck() int {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	found := runner.Detect(exec.LookPath, os.Getenv)
	for _, st := range runner.CheckRuntimes(ctx, found) {
		switch {
		case st.Ready:
			fmt.Printf("ok    %s: ready (%s)\n", st.Name, st.Version)
			if st.Note != "" {
				fmt.Printf("      %s\n", st.Note)
			}
			if len(st.SwitchedOff) > 0 {
				fmt.Printf("      runs switch off %s: this version turns it on and Control Rod has not qualified it yet\n", strings.Join(st.SwitchedOff, ", "))
			}
		case st.NotYet:
			fmt.Printf("--    %s: found, not supported yet (never started until Control Rod can sandbox it)\n", st.Name)
		default:
			fmt.Printf("--    %s: %s\n", st.Name, st.Reason)
		}
	}
	return 0
}
