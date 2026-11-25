// A multi-call stand-in: like a multi-call coreutils, it picks the tool from argv[0].
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

func main() {
	if filepath.Base(os.Args[0]) != "sleep" {
		fmt.Fprintf(os.Stderr, "%s: function/utility not found\n", os.Args[len(os.Args)-1])
		os.Exit(1)
	}
	n, _ := strconv.Atoi(os.Args[1])
	time.Sleep(time.Duration(n) * time.Second)
}
