package runner

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// EgressFilter is a local TCP/CONNECT domain-allowlist proxy (ADR 0021 compliant:
// zero TLS MITM, zero credential injection or relaying). It binds on 127.0.0.1:0
// and permits CONNECT tunnels only to exact host:port entries in its allowlist.
type EgressFilter struct {
	allowlist map[string]bool
	listener  net.Listener
	server    *http.Server
}

// AllowedEgressForLane returns the allowed host:port endpoints for a data lane
// and grade, matching sandbox.ts networkFor(lane, grade). Sensitive lanes
// (proprietary, client-confidential, restricted) permit local Ollama only.
func AllowedEgressForLane(lane, grade string) []string {
	switch strings.ToLower(strings.TrimSpace(lane)) {
	case "public", "internal":
		if strings.ToLower(strings.TrimSpace(grade)) == "strict" {
			return []string{"127.0.0.1:11434", "localhost:11434"}
		}
		return []string{
			"api.anthropic.com:443",
			"api.openai.com:443",
			"api.x.ai:443",
			"generativelanguage.googleapis.com:443",
			"127.0.0.1:11434",
			"localhost:11434",
		}
	default:
		// proprietary, client-confidential, restricted, or unclassified: local only.
		return []string{"127.0.0.1:11434", "localhost:11434"}
	}
}

// StartEgressFilter starts a 127.0.0.1 TCP/CONNECT proxy allowing only allowedHosts.
func StartEgressFilter(allowedHosts []string) (*EgressFilter, error) {
	allow := make(map[string]bool, len(allowedHosts))
	for _, h := range allowedHosts {
		norm := strings.ToLower(strings.TrimSpace(h))
		if norm != "" {
			allow[norm] = true
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen egress filter: %w", err)
	}
	ef := &EgressFilter{
		allowlist: allow,
		listener:  ln,
	}
	ef.server = &http.Server{
		Handler:           ef,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		_ = ef.server.Serve(ln)
	}()
	return ef, nil
}

// Addr returns the proxy's 127.0.0.1:port address.
func (ef *EgressFilter) Addr() string {
	return ef.listener.Addr().String()
}

// Close shuts down the egress filter listener.
func (ef *EgressFilter) Close() error {
	return ef.server.Close()
}

func (ef *EgressFilter) isAllowed(hostPort string) bool {
	norm := strings.ToLower(strings.TrimSpace(hostPort))
	return ef.allowlist[norm]
}

func (ef *EgressFilter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodConnect {
		http.Error(w, "Only CONNECT tunneling is permitted", http.StatusMethodNotAllowed)
		return
	}
	if !ef.isAllowed(r.Host) {
		w.Header().Set("X-ControlRod-Egress", "blocked")
		http.Error(w, fmt.Sprintf("Egress blocked for %s", r.Host), http.StatusForbidden)
		return
	}
	targetConn, err := net.DialTimeout("tcp", r.Host, 10*time.Second)
	if err != nil {
		http.Error(w, fmt.Sprintf("Upstream dial failed: %v", err), http.StatusBadGateway)
		return
	}
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		_ = targetConn.Close()
		http.Error(w, "Hijacking not supported", http.StatusInternalServerError)
		return
	}
	clientConn, _, err := hijacker.Hijack()
	if err != nil {
		_ = targetConn.Close()
		return
	}
	_, _ = clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	go func() {
		defer targetConn.Close()
		defer clientConn.Close()
		_, _ = io.Copy(targetConn, clientConn)
	}()
	go func() {
		defer targetConn.Close()
		defer clientConn.Close()
		_, _ = io.Copy(clientConn, targetConn)
	}()
}
