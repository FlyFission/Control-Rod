package runner

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var daemonIDRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// DaemonID is this daemon home's own random name, kept in <home>/daemon-id. It is not a secret
// and proves nothing: it only keeps two daemons sharing one control plane from taking each other's
// agent update approvals. If it cannot be stored, a new one serves this process.
func DaemonID(home string) string {
	p := filepath.Join(home, "daemon-id")
	if b, err := os.ReadFile(p); err == nil && daemonIDRe.MatchString(strings.TrimSpace(string(b))) {
		return strings.TrimSpace(string(b))
	}
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	id := hex.EncodeToString(raw)
	if err := os.MkdirAll(home, 0o700); err == nil {
		tmp := p + ".tmp"
		if os.WriteFile(tmp, []byte(id+"\n"), 0o600) == nil {
			_ = os.Rename(tmp, p)
		}
	}
	return id
}
