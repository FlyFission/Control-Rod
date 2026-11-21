package runner

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// EgressFilter is a local HTTP and TCP/CONNECT domain-allowlist proxy (ADR 0021 compliant:
// zero TLS MITM, zero credential injection or relaying). It binds on 127.0.0.1:0
// and permits CONNECT tunnels and plain http:// forward requests only to exact
// host:port entries in its allowlist.
//
// The allowlist is the caller's: the daemon builds it from the run's verified sandbox policy
// and runtime provider catalog, so this file holds no provider list of its own.
type EgressFilter struct {
	allowlist map[string]bool
	listener  net.Listener
	server    *http.Server
	transport *http.Transport

	mu      sync.Mutex
	closed  bool
	tunnels map[net.Conn]struct{}
}

// StartEgressFilter starts a 127.0.0.1 HTTP/CONNECT proxy allowing only allowedHosts.
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
		transport: &http.Transport{
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
		},
		tunnels: map[net.Conn]struct{}{},
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

// Close shuts down the listener and every open tunnel. http.Server.Close does not reach a
// hijacked connection, so the filter tracks each tunnel's two ends and closes them itself.
func (ef *EgressFilter) Close() error {
	err := ef.server.Close()
	if ef.transport != nil {
		ef.transport.CloseIdleConnections()
	}
	ef.mu.Lock()
	ef.closed = true
	for c := range ef.tunnels {
		_ = c.Close()
	}
	ef.tunnels = map[net.Conn]struct{}{}
	ef.mu.Unlock()
	return err
}

// track records a tunnel end, or reports false once the filter is closed.
func (ef *EgressFilter) track(conns ...net.Conn) bool {
	ef.mu.Lock()
	defer ef.mu.Unlock()
	if ef.closed {
		return false
	}
	for _, c := range conns {
		ef.tunnels[c] = struct{}{}
	}
	return true
}

func (ef *EgressFilter) untrack(conns ...net.Conn) {
	ef.mu.Lock()
	defer ef.mu.Unlock()
	for _, c := range conns {
		delete(ef.tunnels, c)
	}
}

func (ef *EgressFilter) isAllowed(hostPort string) bool {
	norm := strings.ToLower(strings.TrimSpace(hostPort))
	return ef.allowlist[norm]
}

func (ef *EgressFilter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodConnect {
		ef.serveHTTPForward(w, r)
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
	clientConn, buffered, err := hijacker.Hijack()
	if err != nil {
		_ = targetConn.Close()
		return
	}
	if !ef.track(clientConn, targetConn) {
		_ = clientConn.Close()
		_ = targetConn.Close()
		return
	}
	_, _ = clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	end := func() {
		_ = targetConn.Close()
		_ = clientConn.Close()
		ef.untrack(clientConn, targetConn)
	}
	go func() {
		defer end()
		// Read through the server's buffer: bytes sent with the CONNECT headers are already in it.
		_, _ = io.Copy(targetConn, buffered.Reader)
	}()
	go func() {
		defer end()
		_, _ = io.Copy(clientConn, targetConn)
	}()
}

var hopByHopHeaders = map[string]bool{
	"Connection":          true,
	"Proxy-Connection":    true,
	"Keep-Alive":          true,
	"Proxy-Authenticate":  true,
	"Proxy-Authorization": true,
	"Te":                  true,
	"Trailers":            true,
	"Transfer-Encoding":   true,
	"Upgrade":             true,
}

func stripHopByHop(h http.Header) {
	for _, conn := range h.Values("Connection") {
		for _, field := range strings.Split(conn, ",") {
			if name := strings.TrimSpace(field); name != "" {
				h.Del(name)
			}
		}
	}
	for name := range hopByHopHeaders {
		h.Del(name)
	}
}

func (ef *EgressFilter) serveHTTPForward(w http.ResponseWriter, r *http.Request) {
	if !r.URL.IsAbs() || strings.ToLower(r.URL.Scheme) != "http" {
		http.Error(w, "Only CONNECT and absolute http:// proxy requests are permitted", http.StatusBadRequest)
		return
	}
	hostPort := r.URL.Host
	if hostPort == "" {
		hostPort = r.Host
	}
	if hostPort == "" {
		http.Error(w, "Missing target host", http.StatusBadRequest)
		return
	}
	if host, port, err := net.SplitHostPort(hostPort); err != nil {
		hostPort = net.JoinHostPort(strings.Trim(hostPort, "[]"), "80")
	} else if port == "" {
		hostPort = net.JoinHostPort(host, "80")
	}
	if !ef.isAllowed(hostPort) {
		w.Header().Set("X-ControlRod-Egress", "blocked")
		http.Error(w, fmt.Sprintf("Egress blocked for %s", hostPort), http.StatusForbidden)
		return
	}
	outReq := r.Clone(r.Context())
	outReq.RequestURI = ""
	outReq.URL.Scheme = "http"
	outReq.URL.Host = hostPort
	stripHopByHop(outReq.Header)

	resp, err := ef.transport.RoundTrip(outReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Upstream request failed: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	dst := w.Header()
	for k, vals := range resp.Header {
		for _, v := range vals {
			dst.Add(k, v)
		}
	}
	stripHopByHop(dst)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
