package runner

import (
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"
)

// helperSleep, set in a child's environment, makes this test binary a stand-in runtime that sleeps
// for the seconds in its last argument. Tests that verify and launch a runtime copy this binary
// rather than the host's sleep, whose behavior can depend on its own name (a multi-call build picks
// the tool from argv[0], and a descriptor launch names it /proc/self/fd/N), so the process under
// test is sure to keep running while it is checked.
const helperSleep = "CONTROLROD_TEST_HELPER_SLEEP"

func TestMain(m *testing.M) {
	if os.Getenv(helperSleep) == "1" && len(os.Args) > 1 {
		if n, err := strconv.Atoi(os.Args[len(os.Args)-1]); err == nil {
			time.Sleep(time.Duration(n) * time.Second)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// sleepRuntime is a command that runs a copy of this test binary (see verifiedCopy) as a runtime
// sleeping for secs seconds.
func sleepRuntime(path string, secs int) *exec.Cmd {
	cmd := exec.Command(path, strconv.Itoa(secs))
	cmd.Env = append(os.Environ(), helperSleep+"=1")
	return cmd
}
