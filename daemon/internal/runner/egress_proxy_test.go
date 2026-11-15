package runner

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"testing"
)

func TestAllowedEgressForLane(t *testing.T) {
	pub := AllowedEgressForLane("public", "standard")
	if !slices.Contains(pub, "api.anthropic.com:443") || !slices.Contains(pub, "127.0.0.1:11434") {
		t.Fatalf("unexpected public allowlist: %v", pub)
	}
	prop := AllowedEgressForLane("proprietary", "standard")
	if slices.Contains(prop, "api.anthropic.com:443") || slices.Contains(prop, "api.openai.com:443") {
		t.Fatalf("proprietary lane must not allow cloud endpoints: %v", prop)
	}
	if !slices.Contains(prop, "127.0.0.1:11434") {
		t.Fatalf("proprietary lane should allow local ollama: %v", prop)
	}
}

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
