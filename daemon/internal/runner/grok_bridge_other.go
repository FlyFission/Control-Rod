//go:build !unix

package runner

import (
	"fmt"
	"io"
)

// GrokBridgeMain: the bridge fences Grok with macOS Seatbelt only.
func GrokBridgeMain(_ []string, _, stderr io.Writer) int {
	fmt.Fprintln(stderr, "grok-bridge: Grok CLI is fenced with macOS Seatbelt only")
	return 2
}
