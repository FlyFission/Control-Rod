// Command controlrod is the Control Rod CLI and run daemon.
//
// Phase 0 skeleton: it reports its version. The daemon launches sandboxed agent runs,
// records execution traces and signs evidence in later phases.
package main

import (
	"fmt"
	"os"

	"github.com/flyfission/control-rod/daemon/internal/version"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println(version.Version)
		return
	}
	fmt.Fprintln(os.Stderr, "usage: controlrod version")
	os.Exit(2)
}
