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

The proxy listens only on its address in the call's own internal network and refuses peers from
anywhere else. Every attempt is logged as one JSON line: time, launch, host, port, decision,
reason, bytes up and down; an allowed connection is logged when it opens and again when it closes.
Caller-chosen host names are bounded and reduced to name characters. No header, credential or
payload is ever logged. Connections, log lines and total bytes are capped."""

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


def _u(b: bytes, i: int, n: int) -> int:
    if i + n > len(b):
        raise IndexError
    return int.from_bytes(b[i:i + n], "big")


def sni_of(hello: bytes) -> str | None:
    """The server_name of a TLS ClientHello, or None. Strict: the first record must hold exactly one
    complete ClientHello (a hello fragmented across records is refused, so a name cannot be split
    between records), every length must agree with the bytes present, and there must be exactly
    one server_name extension with exactly one host name."""
    try:
        if len(hello) < 5 or hello[0] != 0x16 or hello[1] != 0x03:
            return None
        rec_len = _u(hello, 3, 2)
        if rec_len > 16384 or len(hello) < 5 + rec_len:
            return None
        body = hello[5:5 + rec_len]
        if body[0] != 0x01 or 4 + _u(body, 1, 3) != len(body):
            return None
        p = 4 + 2 + 32  # handshake header, client_version, random
        p += 1 + _u(body, p, 1)  # session id
        p += 2 + _u(body, p, 2)  # cipher suites
        p += 1 + _u(body, p, 1)  # compression methods
        ext_total = _u(body, p, 2)
        p += 2
        if p + ext_total != len(body):
            return None
        names = []
        seen_sni = 0
        while p < len(body):
            et, el = _u(body, p, 2), _u(body, p + 2, 2)
            if p + 4 + el > len(body):
                return None
            data = body[p + 4:p + 4 + el]
            if et == 0:  # server_name
                seen_sni += 1
                if 2 + _u(data, 0, 2) != len(data):
                    return None
                q = 2
                while q < len(data):
                    nt, nl = _u(data, q, 1), _u(data, q + 1, 2)
                    if q + 3 + nl > len(data):
                        return None
                    if nt == 0:
                        names.append(data[q + 3:q + 3 + nl])
                    q += 3 + nl
            p += 4 + el
        if seen_sni != 1 or len(names) != 1:
            return None
        name = names[0].decode("ascii").lower()
        if not name or len(name) > 253 or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-." for c in name):
            return None
        return name
    except (IndexError, UnicodeDecodeError):
        return None


def safe_host(host) -> str | None:
    """A host name fit for the log: caller-chosen text is bounded and reduced to name characters."""
    if host is None:
        return None
    h = "".join(c for c in str(host).lower() if c in "abcdefghijklmnopqrstuvwxyz0123456789-.:[]")
    return h[:253]


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
                 dial=None, peers=None, max_conns: int = 64, max_log_lines: int = 20000,
                 max_bytes: int | None = None):
        self.allow = {h.lower() for h in allow}
        self.launch = launch
        self.log = log
        self.resolve = resolver or (lambda h, p: [ai[4][0] for ai in socket.getaddrinfo(h, p, type=socket.SOCK_STREAM)])
        self.extra = extra_denied or []
        self.dial = dial or (lambda addr, port: socket.create_connection((addr, port), timeout=15))
        self.peers = peers  # the call network: connections from anywhere else are refused
        self.slots = threading.BoundedSemaphore(max_conns)
        self.max_log_lines, self.lines = max_log_lines, 0
        self.max_bytes = max_bytes
        self.total = 0
        self.lock = threading.Lock()

    def record(self, **kw) -> None:
        if "host" in kw:
            kw["host"] = safe_host(kw["host"])
        with self.lock:
            self.lines += 1
            if self.lines > self.max_log_lines:
                if self.lines == self.max_log_lines + 1:
                    kw = {"decision": "log_cap", "reason": "log line cap reached"}
                else:
                    return
            line = json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "launch": self.launch, **kw},
                              sort_keys=True)
            self.log.write(line + "\n")
            self.log.flush()

    def decide(self, host: str, port: int) -> tuple[list[str] | None, str]:
        """(addresses to dial, "") if allowed, else (None, reason)."""
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
        if not addrs:
            return None, "resolve failed"
        for a in addrs:  # one refused address refuses the host: no partial trust in a rebinding answer
            why = address_refused(a, self.extra)
            if why:
                return None, f"resolved to a refused address ({why})"
        return list(dict.fromkeys(addrs)), ""

    def charge(self, n: int) -> bool:
        """Reserve n bytes of the call's total budget; False once it would be exceeded."""
        with self.lock:
            if self.max_bytes is not None and self.total + n > self.max_bytes:
                return False
            self.total += n
            return True

    def _peer_ok(self, client: socket.socket) -> bool:
        if self.peers is None:
            return True
        try:
            ip = ipaddress.ip_address(client.getpeername()[0])
        except (OSError, ValueError, IndexError, TypeError):
            return False
        return any(ip.version == n.version and ip in n for n in self.peers)

    def handle(self, client: socket.socket, acquired: bool = False) -> None:
        host, port, up, down = None, None, 0, 0
        upstream = None
        if not acquired and not self.slots.acquire(blocking=False):
            self.record(host=None, port=None, decision="denied", reason="connection cap", up=0, down=0)
            client.close()
            return
        try:
            if not self._peer_ok(client):
                self.record(host=None, port=None, decision="denied", reason="peer outside the call network",
                            up=0, down=0)
                return
            client.settimeout(HELLO_WAIT_S)
            head = b""
            while b"\r\n\r\n" not in head and len(head) < MAX_HEAD:
                chunk = client.recv(MAX_HEAD)
                if not chunk:
                    break
                head += chunk
            if not head:
                self.record(host=None, port=None, decision="denied", reason="empty connection", up=0, down=0)
                return
            target = parse_connect(head)
            if target is None:
                client.sendall(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
                self.record(host=None, port=None, decision="denied", reason="not a CONNECT request", up=0, down=0)
                return
            host, port = target
            addrs, why = self.decide(host, port)
            if addrs is None:
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
            last = None
            for a in addrs:
                try:
                    upstream = self.dial(a, port)
                    break
                except OSError as e:
                    last = e
            if upstream is None:
                raise last or OSError("dial failed")
            # logged before any byte is relayed, so a connection cut off later is still on record
            self.record(host=host, port=port, decision="allowed", reason="opened", up=0, down=0)
            if not self.charge(len(hello)):
                self.record(host=host, port=port, decision="denied", reason="byte cap", up=0, down=0)
                return
            upstream.sendall(hello)
            up = len(hello)
            up_more, down = self.relay(client, upstream)
            up += up_more
            self.record(host=host, port=port, decision="allowed", reason="closed", up=up, down=down)
        except OSError as e:
            self.record(host=host, port=port, decision="error", reason=type(e).__name__, up=up, down=down)
        finally:
            for s in (client, upstream):
                if s is not None:
                    try:
                        s.close()
                    except OSError:
                        pass
            self.slots.release()

    def relay(self, a: socket.socket, b: socket.socket) -> tuple[int, int]:
        counts = [0, 0]

        def pump(src, dst, i):
            clean = False
            try:
                src.settimeout(IDLE_S)
                while True:
                    data = src.recv(65536)
                    if not data:
                        clean = True
                        break
                    if not self.charge(len(data)):  # every byte is charged before it is forwarded
                        break
                    dst.sendall(data)
                    counts[i] += len(data)
            except OSError:
                pass
            finally:
                try:  # a clean end of one direction half-closes; anything else closes both
                    if clean:
                        dst.shutdown(socket.SHUT_WR)
                    else:
                        for s in (src, dst):
                            s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
        t = threading.Thread(target=pump, args=(b, a, 1), daemon=True)
        t.start()
        pump(a, b, 0)
        t.join(IDLE_S)
        return counts[0], counts[1]

    def serve(self, listener: socket.socket) -> None:
        while True:
            c, _ = listener.accept()
            if not self.slots.acquire(blocking=False):  # a slot before a thread: a burst cannot exhaust pids
                self.record(host=None, port=None, decision="denied", reason="connection cap", up=0, down=0)
                c.close()
                continue
            threading.Thread(target=self.handle, args=(c, True), daemon=True).start()


def local_address_in(net) -> str:
    """This container's own address on `net` (no packet is sent)."""
    probe = net.network_address + 1
    for _ in range(100):
        try:
            with socket.socket(socket.AF_INET if net.version == 4 else socket.AF_INET6, socket.SOCK_DGRAM) as s:
                s.connect((str(probe), 9))
                ip = s.getsockname()[0]
            if ipaddress.ip_address(ip) in net:
                return ip
        except OSError:
            pass
        time.sleep(0.1)
    raise SystemExit(f"no address on {net}")


def main(argv: list[str]) -> None:
    """egress.py <listen-port> <launch> <log-path> <allowed-host>... --listen-net <cidr>
    [--deny-net <cidr>]... [--max-bytes <n>]"""
    port, launch, log_path, rest = int(argv[0]), argv[1], argv[2], argv[3:]
    allow, extra, listen, max_bytes = [], [], None, None
    while rest:
        a = rest.pop(0)
        if a == "--deny-net":
            extra.append(ipaddress.ip_network(rest.pop(0), strict=False))
        elif a == "--listen-net":
            listen = ipaddress.ip_network(rest.pop(0), strict=False)
        elif a == "--max-bytes":
            max_bytes = int(rest.pop(0))
        else:
            allow.append(a)
    if listen is None:
        raise SystemExit("--listen-net is required: the proxy listens on the call network only")
    srv = socket.create_server((local_address_in(listen), port), reuse_port=False)
    with open(log_path, "a", buffering=1) as log:
        px = Proxy(allow, launch, log, extra_denied=extra, peers=[listen], max_bytes=max_bytes)
        px.record(host=None, port=port, decision="start", reason="listening", up=0, down=0)
        print("ready", flush=True)
        px.serve(srv)


if __name__ == "__main__":
    main(sys.argv[1:])
