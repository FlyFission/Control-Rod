//go:build darwin

package runner

import (
	"fmt"
	"os/exec"
)

func checkerLinksDeliverables() bool { return false }

// checkerMountArgv runs the checker under Seatbelt. Seatbelt cannot mount a
// directory over another path, so the disposable session directories used on
// Linux are not write targets here. The profile denies reads of the real
// session directories instead. Claude is already started with
// --no-session-persistence and Codex with --ephemeral. There is no documented
// variable that moves only projects, debug, todos, sessions, or log while
// leaving the credential file in the real login directory. CLAUDE_CONFIG_DIR
// and CODEX_HOME move the credential file as well, so they are not pointed at
// the disposable directory. Every allowed write path is canonicalized first.
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	if cmd == nil || len(cmd.Args) == 0 || ws == nil {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	bin, err := exec.LookPath("sandbox-exec")
	if err != nil {
		return nil, fmt.Errorf("Seatbelt (sandbox-exec) is not available, so the checker cannot deny writes outside scratch and the check cannot count")
	}
	files, evidence, err := checkerWriteTargets(ws)
	if err != nil {
		return nil, err
	}
	var writable []string
	for _, p := range append(files, evidence) {
		c, err := canonicalPath(p)
		if err != nil {
			return nil, fmt.Errorf("cannot canonicalize %s (%v), so the check cannot count", p, err)
		}
		writable = append(writable, c)
	}
	runTmp, err := makeCheckerRunTmp(ws)
	if err != nil {
		return nil, fmt.Errorf("cannot create the checker temporary directory (%v), so the check cannot count", err)
	}
	plan, err := planCheckerLogin(ws)
	if err != nil {
		return nil, err
	}
	extra, err := checkerSeatbeltPaths(plan)
	if err != nil {
		return nil, err
	}
	writable = append(writable, runTmp)
	writable = append(writable, extra...)
	if _, err := canonicalPath(ws.Deliverables); err != nil {
		return nil, fmt.Errorf("cannot canonicalize the deliverable tree (%v), so the check cannot count", err)
	}
	setCheckerTmpEnv(cmd, runTmp)
	denies := sessionReadDenies(plan.Root, loginSessionDirs(ws.CheckerRuntime))
	var verdicts []string
	for _, p := range files {
		c, err := canonicalPath(p)
		if err != nil {
			return nil, fmt.Errorf("cannot canonicalize %s (%v), so the check cannot count", p, err)
		}
		verdicts = append(verdicts, c)
	}
	atomic, err := seatbeltAtomicWrites(verdicts)
	if err != nil {
		return nil, err
	}
	return append([]string{bin, "-p", seatbeltProfile(writable, denies) + atomic}, cmd.Args...), nil
}
