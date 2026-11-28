package runner

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestEgressFilterBlocksAndAllowsConnect(t *testing.T) {
	// Spin up a local echo TCP server as the allowlisted target.
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()
	go func() {
		conn, err := targetLn.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = io.Copy(conn, conn)
	}()

	targetAddr := targetLn.Addr().String()
	ef, err := StartEgressFilter([]string{targetAddr})
	if err != nil {
		t.Fatal(err)
	}
	defer ef.Close()

	// 1. Blocked host returns 403 Forbidden.
	connBlocked, err := net.Dial("tcp", ef.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer connBlocked.Close()
	_, _ = fmt.Fprintf(connBlocked, "CONNECT evil.example.com:443 HTTP/1.1\r\nHost: evil.example.com:443\r\n\r\n")
	respBlocked, err := http.ReadResponse(bufio.NewReader(connBlocked), nil)
	if err != nil {
		t.Fatal(err)
	}
	if respBlocked.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for blocked host, got %d", respBlocked.StatusCode)
	}
	if respBlocked.Header.Get("X-ControlRod-Egress") != "blocked" {
		t.Fatalf("expected X-ControlRod-Egress=blocked header")
	}

	// 2. Allowlisted host tunnels cleanly without TLS MITM.
	connAllowed, err := net.Dial("tcp", ef.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer connAllowed.Close()
	_, _ = fmt.Fprintf(connAllowed, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", targetAddr, targetAddr)
	br := bufio.NewReader(connAllowed)
	statusLine, err := br.ReadString('\n')
	if err != nil || !strings.Contains(statusLine, "200") {
		t.Fatalf("expected 200 Connection Established, got %q (err=%v)", statusLine, err)
	}
	// Drain blank line
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}
	_, _ = connAllowed.Write([]byte("ping"))
	buf := make([]byte, 4)
	if _, err := io.ReadFull(br, buf); err != nil || string(buf) != "ping" {
		t.Fatalf("expected echoed 'ping', got %q (err=%v)", string(buf), err)
	}
}

func TestEgressFilterForwardsReplyAfterClientHalfCloses(t *testing.T) {
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()
	go func() {
		conn, err := targetLn.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		if msg, err := io.ReadAll(conn); err == nil {
			_, _ = fmt.Fprintf(conn, "reply:%s", msg)
		}
	}()

	target := targetLn.Addr().String()
	ef, err := StartEgressFilter([]string{target})
	if err != nil {
		t.Fatal(err)
	}
	defer ef.Close()
	conn, err := net.DialTimeout("tcp", ef.Addr(), 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target); err != nil {
		t.Fatal(err)
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("CONNECT response: %v, %v", resp, err)
	}
	if _, err := io.WriteString(conn, "hello"); err != nil {
		t.Fatal(err)
	}
	if err := conn.(*net.TCPConn).CloseWrite(); err != nil {
		t.Fatal(err)
	}
	if reply, err := io.ReadAll(br); err != nil || string(reply) != "reply:hello" {
		t.Fatalf("reply %q: %v", reply, err)
	}
}

// Closing the filter ends a tunnel that is already open, so no traffic outlives it.
func TestEgressFilterCloseEndsOpenTunnels(t *testing.T) {
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()
	go func() {
		conn, err := targetLn.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = io.Copy(conn, conn)
	}()
	target := targetLn.Addr().String()
	ef, err := StartEgressFilter([]string{target})
	if err != nil {
		t.Fatal(err)
	}
	conn, err := net.Dial("tcp", ef.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target)
	br := bufio.NewReader(conn)
	if line, err := br.ReadString('\n'); err != nil || !strings.Contains(line, "200") {
		t.Fatalf("tunnel not opened: %q %v", line, err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}
	if err := ef.Close(); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _ = conn.Write([]byte("x"))
	if _, err := br.ReadByte(); err == nil {
		t.Fatal("tunnel still carried traffic after Close")
	} else if ne, ok := err.(net.Error); ok && ne.Timeout() {
		t.Fatal("tunnel was left open after Close")
	}
}

// Bytes the client sends in the same write as the CONNECT headers still reach the target.
func TestEgressFilterForwardsBytesSentWithTheConnect(t *testing.T) {
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()
	go func() {
		conn, err := targetLn.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = io.Copy(conn, conn)
	}()
	target := targetLn.Addr().String()
	ef, err := StartEgressFilter([]string{target})
	if err != nil {
		t.Fatal(err)
	}
	defer ef.Close()
	conn, err := net.Dial("tcp", ef.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\nping", target, target)
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	br := bufio.NewReader(conn)
	if line, err := br.ReadString('\n'); err != nil || !strings.Contains(line, "200") {
		t.Fatalf("tunnel not opened: %q %v", line, err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}
	buf := make([]byte, 4)
	if _, err := io.ReadFull(br, buf); err != nil || string(buf) != "ping" {
		t.Fatalf("bytes sent with the CONNECT were lost: %q %v", buf, err)
	}
}

func TestEgressFilterPlainHTTPForwardingAllowsAndBlocks(t *testing.T) {
	allowedSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Upstream", "ok")
		_, _ = fmt.Fprintf(w, "hello %s", r.URL.Path)
	}))
	defer allowedSrv.Close()

	blockedSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("blocked upstream was contacted")
	}))
	defer blockedSrv.Close()

	allowedURL, err := url.Parse(allowedSrv.URL)
	if err != nil {
		t.Fatal(err)
	}
	ef, err := StartEgressFilter([]string{allowedURL.Host})
	if err != nil {
		t.Fatal(err)
	}
	defer ef.Close()

	proxyURL, err := url.Parse("http://" + ef.Addr())
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{
		Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)},
		Timeout:   3 * time.Second,
	}

	resp, err := client.Get(allowedSrv.URL + "/api/tags")
	if err != nil {
		t.Fatalf("allowlisted plain HTTP request failed: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(body) != "hello /api/tags" || resp.Header.Get("X-Upstream") != "ok" {
		t.Fatalf("unexpected allowed response: status=%d body=%q headers=%v", resp.StatusCode, string(body), resp.Header)
	}

	blockedResp, err := client.Get(blockedSrv.URL + "/secret")
	if err != nil {
		t.Fatalf("blocked plain HTTP request errored: %v", err)
	}
	_ = blockedResp.Body.Close()
	if blockedResp.StatusCode != http.StatusForbidden || blockedResp.Header.Get("X-ControlRod-Egress") != "blocked" {
		t.Fatalf("expected 403 X-ControlRod-Egress=blocked, got %d (%q)", blockedResp.StatusCode, blockedResp.Header.Get("X-ControlRod-Egress"))
	}
}

// openTunnel starts an echo target and a filter that allows it, and returns a CONNECT tunnel to it.
func openTunnel(t *testing.T) net.Conn {
	t.Helper()
	targetLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = targetLn.Close() })
	go func() {
		for {
			conn, err := targetLn.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				_, _ = io.Copy(conn, conn)
			}()
		}
	}()
	ef, err := StartEgressFilter([]string{targetLn.Addr().String()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ef.Close() })
	conn, err := net.DialTimeout("tcp", ef.Addr(), 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	target := targetLn.Addr().String()
	if _, err := fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target); err != nil {
		t.Fatal(err)
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("CONNECT: %v %v", resp, err)
	}
	if br.Buffered() != 0 {
		t.Fatalf("unexpected bytes after the CONNECT reply")
	}
	return conn
}

func echoOnce(t *testing.T, conn net.Conn) {
	t.Helper()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := conn.Write([]byte("x")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 1)
	if _, err := io.ReadFull(conn, buf); err != nil {
		t.Fatalf("echo: %v", err)
	}
}

func TestEgressFilterClosesAnIdleTunnel(t *testing.T) {
	old := tunnelIdleTimeout
	tunnelIdleTimeout = 200 * time.Millisecond
	t.Cleanup(func() { tunnelIdleTimeout = old })

	conn := openTunnel(t)
	echoOnce(t, conn)
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
	start := time.Now()
	n, err := conn.Read(make([]byte, 1))
	if err == nil || n != 0 {
		t.Fatalf("idle tunnel stayed open: n=%d err=%v", n, err)
	}
	if ne, ok := err.(net.Error); ok && ne.Timeout() {
		t.Fatalf("idle tunnel was not closed within 3s")
	}
	if waited := time.Since(start); waited < 100*time.Millisecond {
		t.Fatalf("tunnel closed after %v, before it was idle", waited)
	}
}

func TestEgressFilterKeepsABusyTunnelOpen(t *testing.T) {
	old := tunnelIdleTimeout
	tunnelIdleTimeout = 300 * time.Millisecond
	t.Cleanup(func() { tunnelIdleTimeout = old })

	conn := openTunnel(t)
	// Traffic every 50ms for well past the idle limit keeps the tunnel.
	deadline := time.Now().Add(1200 * time.Millisecond)
	for time.Now().Before(deadline) {
		echoOnce(t, conn)
		time.Sleep(50 * time.Millisecond)
	}
}
