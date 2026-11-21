package runner

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
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
