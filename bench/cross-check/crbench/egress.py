"""The per-call egress proxy (DESIGN-v3.4-proposal.md, Network). Standard library only: it runs as
`python3 -I egress.py` in its own container, the only one on the call's internal network that also
has a route out.

Rules, in order, for each client connection:
- the first request must be `CONNECT <host>:443 HTTP/1.1`; anything else is refused;
- <host> must be on the frozen allowlist exactly (no wildcards) and must not be an IP literal;
- the proxy resolves <host> itself and refuses any resolved address that is loopback, private,
  shared (CGNAT), link-local, multicast, reserved or unspecified, or one of the extra denied
  networks (the host or VM gateway);
- after `200`, the client's first bytes must be a TLS ClientHello whose server name equals <host>;
  otherwise the connection is closed before a byte reaches the upstream;
- bytes are then relayed both ways, never inspected or logged.

Every attempt is logged as one JSON line: time, launch, host, port, decision, reason, bytes up and
down. No header, credential or payload is ever logged."""

from __future__ import annotations

import ipaddress
import json
import socket
import sys
import threading
import time

MAX_HEAD = 8192
HELLO_WAIT_S = 15
IDLE_S = 600
EXTRA_DENIED = [ipaddress.ip_network(n) for n in ("100.64.0.0/10", "192.0.0.0/24", "198.18.0.0/15")]


def is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        return False


def address_refused(addr: str, extra: list | None = None) -> str | None:
    """Why a resolved address may not be dialled, or None."""
    ip = ipaddress.ip_address(addr)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    for name in ("is_loopback", "is_private", "is_link_local", "is_multicast", "is_reserved", "is_unspecified"):
        if getattr(ip, name):
            return name[3:].replace("_", "-")
    for net in EXTRA_DENIED + list(extra or []):
        if ip.version == net.version and ip in net:
            return f"denied network {net}"
    return None


def parse_connect(head: bytes) -> tuple[str, int] | None:
    """(host, port) from a CONNECT request head, or None if it is anything else."""
    try:
        line = head.split(b"\r\n", 1)[0].decode("ascii")
    except UnicodeDecodeError:
        return None
    parts = line.split(" ")
    if len(parts) != 3 or parts[0] != "CONNECT" or not parts[2].startswith("HTTP/1."):
        return None
    target = parts[1]
    if target.startswith("["):
        host, _, rest = target[1:].partition("]")
        port = rest[1:] if rest.startswith(":") else ""
    else:
        host, _, port = target.rpartition(":")
    if not host or not port.isdigit():
        return None
    return host.lower(), int(port)


def sni_of(hello: bytes) -> str | None:
    """The server_name from a TLS ClientHello record, or None if it is not one or has none."""
    try:
        if len(hello) < 5 or hello[0] != 0x16:
            return None
        rec_len = int.from_bytes(hello[3:5], "big")
        body = hello[5:5 + rec_len]
        if len(body) < 4 or body[0] != 0x01:
            return None
        p = 4 + 2 + 32  # handshake header, client_version, random
        sid = body[p]
        p += 1 + sid
        cs = int.from_bytes(body[p:p + 2], "big")
        p += 2 + cs
        comp = body[p]
        p += 1 + comp
        ext_total = int.from_bytes(body[p:p + 2], "big")
        p += 2
        end = min(p + ext_total, len(body))
        while p + 4 <= end:
            et, el = int.from_bytes(body[p:p + 2], "big"), int.from_bytes(body[p + 2:p + 4], "big")
            data = body[p + 4:p + 4 + el]
            if et == 0:  # server_name
                q = 2
                while q + 3 <= len(data):
                    nt, nl = data[q], int.from_bytes(data[q + 1:q + 3], "big")
                    if nt == 0:
                        return data[q + 3:q + 3 + nl].decode("ascii").lower()
                    q += 3 + nl
                return None
            p += 4 + el
    except (IndexError, UnicodeDecodeError):
        return None
    return None


def read_hello(sock: socket.socket) -> bytes:
    """The whole first TLS record (a ClientHello can span several reads)."""
    sock.settimeout(HELLO_WAIT_S)
    buf = b""
    while len(buf) < 5 or len(buf) < 5 + int.from_bytes(buf[3:5], "big"):
        chunk = sock.recv(65536)
        if not chunk:
            break
        buf += chunk
        if len(buf) > 5 + 16384 + 5:
            break
    return buf


class Proxy:
    def __init__(self, allow: list[str], launch: str, log, resolver=None, extra_denied=None,
                 dial=None):
        self.allow = {h.lower() for h in allow}
        self.launch = launch
        self.log = log
        self.resolve = resolver or (lambda h, p: [ai[4][0] for ai in socket.getaddrinfo(h, p, type=socket.SOCK_STREAM)])
        self.extra = extra_denied or []
        self.dial = dial or (lambda addr, port: socket.create_connection((addr, port), timeout=15))
        self.lock = threading.Lock()

    def record(self, **kw) -> None:
        line = json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "launch": self.launch, **kw},
                          sort_keys=True)
        with self.lock:
            self.log.write(line + "\n")
            self.log.flush()

    def decide(self, host: str, port: int) -> tuple[str | None, str]:
        """(address to dial, "") if allowed, else (None, reason)."""
        if port != 443:
            return None, "port"
        if is_ip_literal(host):
            return None, "ip literal"
        if host not in self.allow:
            return None, "not on allowlist"
        try:
            addrs = self.resolve(host, port)
        except OSError:
            return None, "resolve failed"
        for a in addrs:
            why = address_refused(a, self.extra)
            if why:
                return None, f"resolved to a refused address ({why})"
        if not addrs:
            return None, "resolve failed"
        return addrs[0], ""

    def handle(self, client: socket.socket) -> None:
        host, port, up, down = None, None, 0, 0
        try:
            client.settimeout(HELLO_WAIT_S)
            head = b""
            while b"\r\n\r\n" not in head and len(head) < MAX_HEAD:
                chunk = client.recv(MAX_HEAD)
                if not chunk:
                    break
                head += chunk
            target = parse_connect(head)
            if target is None:
                client.sendall(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
                self.record(host=None, port=None, decision="denied", reason="not a CONNECT request", up=0, down=0)
                return
            host, port = target
            addr, why = self.decide(host, port)
            if addr is None:
                client.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
                self.record(host=host, port=port, decision="denied", reason=why, up=0, down=0)
                return
            client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            hello = read_hello(client)
            name = sni_of(hello)
            if name != host:
                self.record(host=host, port=port, decision="denied",
                            reason="no TLS ClientHello" if name is None else "server name differs from CONNECT host",
                            up=0, down=0)
                return
            upstream = self.dial(addr, port)
            upstream.sendall(hello)
            up = len(hello)
            up_more, down = self.relay(client, upstream)
            up += up_more
            self.record(host=host, port=port, decision="allowed", reason="", up=up, down=down)
        except OSError as e:
            self.record(host=host, port=port, decision="error", reason=type(e).__name__, up=up, down=down)
        finally:
            client.close()

    @staticmethod
    def relay(a: socket.socket, b: socket.socket) -> tuple[int, int]:
        counts = [0, 0]

        def pump(src, dst, i):
            try:
                src.settimeout(IDLE_S)
                while True:
                    data = src.recv(65536)
                    if not data:
                        break
                    dst.sendall(data)
                    counts[i] += len(data)
            except OSError:
                pass
            finally:
                for s in (src, dst):
                    try:
                        s.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass
        t = threading.Thread(target=pump, args=(b, a, 1), daemon=True)
        t.start()
        pump(a, b, 0)
        t.join(IDLE_S)
        b.close()
        return counts[0], counts[1]

    def serve(self, listener: socket.socket) -> None:
        while True:
            c, _ = listener.accept()
            threading.Thread(target=self.handle, args=(c,), daemon=True).start()


def main(argv: list[str]) -> None:
    """egress.py <listen-port> <launch> <log-path> <allowed-host>... [--deny-net <cidr>]..."""
    port, launch, log_path, rest = int(argv[0]), argv[1], argv[2], argv[3:]
    allow, extra = [], []
    while rest:
        a = rest.pop(0)
        if a == "--deny-net":
            extra.append(ipaddress.ip_network(rest.pop(0), strict=False))
        else:
            allow.append(a)
    srv = socket.create_server(("0.0.0.0", port), reuse_port=False)
    with open(log_path, "a", buffering=1) as log:
        print("ready", flush=True)
        Proxy(allow, launch, log, extra_denied=extra).serve(srv)


if __name__ == "__main__":
    main(sys.argv[1:])
