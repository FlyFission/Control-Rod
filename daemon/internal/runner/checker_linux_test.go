//go:build linux

package runner

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"
)

func copyRegularFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func TestVerifiedRuntimeMayBeAGrandchild(t *testing.T) {
	// The outer shell stands in for systemd-run, the middle shell for bubblewrap,
	// and sleep for the verified runtime. Start's pid is the launcher.
	cmd := exec.Command("/bin/sh", "-c", "sh -c 'sleep 30'")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	f, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if childRuns(cmd.Process.Pid, st) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the verified executable was not found below the outer process")
}

func TestCheckerMountFailsClosedWithoutBubblewrap(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("claude", "-p", CheckerPrompt)
	_, err := checkerMountArgv(cmd, ws)
	if err == nil || !strings.Contains(err.Error(), "cannot count") {
		t.Fatalf("missing bubblewrap: %v", err)
	}
}

func TestBubblewrapMountsDeliverablesReadOnly(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal("bubblewrap is not installed; the read-only mount was not run")
	}
	ws, _ := prepareCheckerFixture(t)
	before, err := TreeDigest(ws.Deliverables)
	if err != nil {
		t.Fatal(err)
	}
	script := "echo tampered >> inputs/deliverables/report.md; echo wrote > scratch/evidence/from-mount.txt; echo side > scratch/side.txt; echo SIDE:$? > scratch/evidence/side"
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	after, err := TreeDigest(ws.Deliverables)
	if err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatal("bubblewrap let the checker change the deliverable tree")
	}
	body, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil || strings.Contains(string(body), "tampered") {
		t.Fatalf("deliverable bytes %q", body)
	}
	if _, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", "from-mount.txt")); err != nil {
		t.Fatal("evidence was not writable inside the mount")
	}
	if _, err := os.Lstat(filepath.Join(ws.Scratch, "side.txt")); !os.IsNotExist(err) {
		t.Fatal("a file outside the allowed scratch paths was created")
	}
	side, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", "side"))
	if err != nil || strings.HasSuffix(strings.TrimSpace(string(side)), ":0") {
		t.Fatalf("scratch/side.txt was writable: %s", side)
	}
	argv, err := checkerMountArgv(exec.Command("claude", "-p", CheckerPrompt), ws)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(argv, "\n")
	if !strings.Contains(joined, "--ro-bind") || !strings.Contains(joined, ws.Deliverables) {
		t.Fatalf("mount argv %q", argv)
	}
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "HOME=") && strings.Contains(kv, ws.Dir) {
			t.Fatalf("mount replaced HOME with the workspace: %s", kv)
		}
	}
}

func TestCheckerMountBindsTheVerifiedDescriptor(t *testing.T) {
	f, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	link, err := os.Readlink(fmt.Sprintf("/proc/self/fd/%d", f.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	ws.VerifiedPath = "/opt/controlrod/verified-sleep"
	cmd := exec.Command("/proc/self/fd/3", "-p", CheckerPrompt)
	cmd.ExtraFiles = []*os.File{f}
	argv, err := checkerMountArgv(cmd, ws)
	if err != nil {
		t.Fatal(err)
	}
	if !hasArgPair(argv, "--ro-bind-fd", "3") || !slices.Contains(argv, ws.VerifiedPath) {
		t.Fatalf("verified descriptor was not mounted at the given path: %q", argv)
	}
	if slices.Contains(argv, link) && link != ws.VerifiedPath {
		t.Fatal("mount used /proc/self/fd instead of VerifiedPath")
	}
	inner := argv[len(argv)-1]
	if inner == "/proc/self/fd/3" {
		t.Fatal("inner command still uses a descriptor bubblewrap will close")
	}
}

func TestConfirmSandboxSeesTheBubblewrapChild(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	// /bin/sleep is often a symlink to /usr/bin/sleep. Mounting the descriptor
	// onto that symlink path does not make the child execute the opened inode.
	// A regular file inside the workspace does.
	bin := filepath.Join(ws.Dir, "sleep")
	if err := copyRegularFile("/bin/sleep", bin); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(bin)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	ws.VerifiedPath = bin
	cmd := exec.Command("/proc/self/fd/3", "30")
	cmd.ExtraFiles = []*os.File{f}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	v := &VerifiedLaunch{File: f, Path: bin}
	if err := v.ConfirmSandbox(cmd.Process.Pid); err != nil {
		t.Fatalf("%v; stderr %s", err, stderr.String())
	}
	old := confirmWait
	confirmWait = 300 * time.Millisecond
	t.Cleanup(func() { confirmWait = old })
	if err := v.Confirm(cmd.Process.Pid); err == nil {
		t.Fatal("bubblewrap itself was accepted as the verified runtime")
	}
}

func TestCheckerMountBlocksWritesOutsideScratch(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	home := os.Getenv("HOME")
	if home == "" {
		t.Fatal("HOME is empty")
	}
	homeFile := filepath.Join(home, fmt.Sprintf("checker-escape-%d", os.Getpid()))
	tmpFile := filepath.Join("/tmp", fmt.Sprintf("checker-escape-%d", os.Getpid()))
	sibDir := filepath.Join(filepath.Dir(ws.Dir), "side")
	if err := os.MkdirAll(sibDir, 0o700); err != nil {
		t.Fatal(err)
	}
	sibFile := filepath.Join(sibDir, "escape.txt")
	t.Cleanup(func() {
		_ = os.Remove(homeFile)
		_ = os.Remove(tmpFile)
		_ = os.Remove(sibFile)
	})
	before, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil {
		t.Fatal(err)
	}
	script := `echo ok > scratch/verification.json
echo x > "$HOME_FILE"; echo HOME:$? > scratch/evidence/home
echo x > "$TMP_FILE"; echo TMP:$? > scratch/evidence/tmp
echo x > "$SIB_FILE"; echo SIB:$? > scratch/evidence/sib
`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "HOME_FILE="+homeFile, "TMP_FILE="+tmpFile, "SIB_FILE="+sibFile)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(homeFile); !os.IsNotExist(err) {
		t.Fatalf("write to HOME landed on the host: %v", err)
	}
	if _, err := os.Stat(tmpFile); !os.IsNotExist(err) {
		t.Fatalf("write to /tmp landed on the host: %v", err)
	}
	if _, err := os.Stat(sibFile); !os.IsNotExist(err) {
		t.Fatalf("write to the deliverable sibling landed: %v", err)
	}
	after, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil || string(after) != string(before) {
		t.Fatalf("deliverable bytes changed: %q", after)
	}
	for _, name := range []string{"home", "sib"} {
		b, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", name))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(b), ":2") && !strings.Contains(string(b), ":1") {
			t.Fatalf("%s write was not blocked: %s", name, b)
		}
	}
	if _, err := os.ReadFile(filepath.Join(ws.Scratch, "verification.json")); err != nil {
		t.Fatal("scratch was not writable")
	}
}

func TestUnixSocketFilterRejectsAnUnknownArch(t *testing.T) {
	if _, err := unixSocketFilter("riscv64"); err == nil {
		t.Fatal("an unknown architecture produced a filter")
	}
	for _, arch := range []string{"amd64", "arm64"} {
		raw, err := unixSocketFilter(arch)
		if err != nil {
			t.Fatal(err)
		}
		if len(raw) == 0 || len(raw)%8 != 0 {
			t.Fatalf("%s filter length %d", arch, len(raw))
		}
	}
}

func seccompData(nr uint32, arch uint32, args [6]uint64) []byte {
	data := make([]byte, 64)
	binary.LittleEndian.PutUint32(data[0:4], nr)
	binary.LittleEndian.PutUint32(data[4:8], arch)
	for i, arg := range args {
		binary.LittleEndian.PutUint64(data[16+8*i:16+8*i+8], arg)
	}
	return data
}

func evalSeccomp(t *testing.T, raw, data []byte) uint32 {
	t.Helper()
	pc := 0
	var acc uint32
	for step := 0; step < 64; step++ {
		if pc < 0 || pc >= len(raw)/8 {
			t.Fatalf("pc %d left the program", pc)
		}
		insn := raw[pc*8 : pc*8+8]
		code := binary.LittleEndian.Uint16(insn[0:2])
		jt, jf := insn[2], insn[3]
		k := binary.LittleEndian.Uint32(insn[4:8])
		switch code {
		case bpfLdAbs:
			off := int(k)
			if off < 0 || off+4 > len(data) {
				t.Fatalf("load %d", off)
			}
			acc = binary.LittleEndian.Uint32(data[off : off+4])
			pc++
		case bpfJeqK:
			if acc == k {
				pc += 1 + int(jt)
			} else {
				pc += 1 + int(jf)
			}
		case bpfJgeK:
			if acc >= k {
				pc += 1 + int(jt)
			} else {
				pc += 1 + int(jf)
			}
		case bpfAndK:
			acc &= k
			pc++
		case bpfRetK:
			return k
		default:
			t.Fatalf("opcode %#x", code)
		}
	}
	t.Fatal("filter did not return")
	return 0
}

func TestUnixSocketFilterDecisions(t *testing.T) {
	const (
		eperm = seccompRetErrno | errnoPerm
		allow = seccompRetAllow
		kill  = seccompRetKill
	)
	type spec struct {
		archName   string
		audit      uint32
		socket     uint32
		socketpair uint32
	}
	arches := []spec{
		{"amd64", auditArchX86_64, sysSocketAMD64, sysSocketpairAMD64},
		{"arm64", auditArchAarch64, sysSocketARM64, sysSocketpairARM64},
	}
	for _, arch := range arches {
		raw, err := unixSocketFilter(arch.archName)
		if err != nil {
			t.Fatal(err)
		}
		check := func(name string, nr uint32, domain, typ uint64, want uint32) {
			t.Helper()
			var args [6]uint64
			args[0] = domain
			args[1] = typ
			got := evalSeccomp(t, raw, seccompData(nr, arch.audit, args))
			if got != want {
				t.Errorf("%s %s nr %d domain %d type %#x: got %#x want %#x", arch.archName, name, nr, domain, typ, got, want)
			}
		}
		check("x32 socket", x32SyscallBit|arch.socket, afUnix, sockStream, eperm)
		check("io_uring_setup", sysIoUringSetup, 0, 0, eperm)
		check("io_uring_enter", sysIoUringEnter, 0, 0, eperm)
		check("io_uring_register", sysIoUringReg, 0, 0, eperm)
		check("dgram pair", arch.socketpair, afUnix, sockDgram, eperm)
		check("dgram pair with flags", arch.socketpair, afUnix, sockDgram|sockCloexec|sockNonblock, eperm)
		check("stream pair with cloexec", arch.socketpair, afUnix, sockStream|sockCloexec, allow)
		check("seqpacket pair", arch.socketpair, afUnix, sockSeqpacket|sockNonblock, allow)
		check("inet socket", arch.socket, 2, sockStream, allow)
		check("unix socket", arch.socket, afUnix, sockStream, eperm)
		check("inet dgram pair", arch.socketpair, 2, sockDgram, allow)
		high := uint64(sockStream) | (1 << 32)
		check("stream pair with high type bits", arch.socketpair, afUnix, high, eperm)
		got := evalSeccomp(t, raw, seccompData(0, 0, [6]uint64{}))
		if got != kill {
			t.Errorf("%s wrong arch: got %#x", arch.archName, got)
		}
	}
}

func TestSocketMaskFollowsASymlinkParent(t *testing.T) {
	dir := t.TempDir()
	run := filepath.Join(dir, "run")
	if err := os.MkdirAll(run, 0o700); err != nil {
		t.Fatal(err)
	}
	realSock := filepath.Join(run, "docker.sock")
	ln, err := net.Listen("unix", realSock)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if err := os.Symlink("run", filepath.Join(dir, "var-run")); err != nil {
		t.Fatal(err)
	}
	via := filepath.Join(dir, "var-run", "docker.sock")
	got := socketMaskTargets(via)
	if len(got) != 1 || got[0] != realSock {
		t.Fatalf("mask targets %v, want %s", got, realSock)
	}
	link := filepath.Join(dir, "agent.sock")
	if err := os.Symlink(realSock, link); err != nil {
		t.Fatal(err)
	}
	got = socketMaskTargets(link)
	have := map[string]bool{}
	for _, p := range got {
		have[p] = true
	}
	if !have[link] || !have[realSock] {
		t.Fatalf("symlink socket masks %v", got)
	}
}

func TestCheckerCannotReachAHostUnixSocket(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp("/var/tmp", "cr-sock-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	sock := filepath.Join(dir, "agent.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	contacted := make(chan struct{}, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			_ = c.Close()
			contacted <- struct{}{}
		}
	}()
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("python3", "-c", `import socket,sys
try:
    s=socket.socket(socket.AF_UNIX)
    s.settimeout(2)
    s.connect(sys.argv[1])
except OSError:
    raise SystemExit(0)
raise SystemExit(2)
`, sock)
	cmd.Dir = ws.Dir
	// No socket variable names this path. The filter has to block it.
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("checker reached the host socket: %v", err)
	}
	select {
	case <-contacted:
		t.Fatal("the host socket accepted a connection from the checker")
	default:
	}
	joined := strings.Join(cmd.Args, "\n")
	if !strings.Contains(joined, "--seccomp\n") {
		t.Fatal("mount did not install a seccomp filter")
	}
	if strings.Contains(joined, "--ro-bind\n/dev/null\n"+sock) {
		t.Fatal("the unadvertised socket was hidden by path, so the filter was not what blocked it")
	}
}

func TestCheckerCannotReachAnAbstractUnixSocket(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	name := "\x00cr-test-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	contacted := make(chan struct{}, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			_ = c.Close()
			contacted <- struct{}{}
		}
	}()
	ws, _ := prepareCheckerFixture(t)
	if err := os.WriteFile(filepath.Join(ws.Scratch, "abstract-name"), []byte(name), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("python3", "-c", `import socket
name = open("scratch/abstract-name","rb").read()
try:
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(2)
    s.connect(name)
except OSError:
    raise SystemExit(0)
raise SystemExit(2)
`)
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("checker reached the abstract socket: %v", err)
	}
	select {
	case <-contacted:
		t.Fatal("the abstract socket accepted a connection from the checker")
	default:
	}
}

func TestCheckerKeepsSocketpairAndTCP(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan struct{}, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			_ = c.Close()
			got <- struct{}{}
		}
	}()
	port := ln.Addr().(*net.TCPAddr).Port
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("python3", "-c", `import socket,sys
a,b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM|socket.SOCK_CLOEXEC)
a.send(b"z")
if b.recv(1) != b"z":
    raise SystemExit(3)
s = socket.socket()
s.settimeout(2)
s.connect(("127.0.0.1", int(sys.argv[1])))
`, strconv.Itoa(port))
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("socketpair or TCP was blocked: %v", err)
	}
	select {
	case <-got:
	default:
		t.Fatal("the TCP listener saw no connection")
	}
}

func TestCheckerRejectsX32AndIoUring(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	script := `import ctypes, errno
libc = ctypes.CDLL(None, use_errno=True)
libc.syscall.restype = ctypes.c_long
def call(nr):
    ctypes.set_errno(0)
    rc = libc.syscall(ctypes.c_long(nr), ctypes.c_long(1), ctypes.c_long(0), ctypes.c_long(0))
    return rc, ctypes.get_errno()
rc, err = call((1 << 30) | 41)
if err == errno.ENOSYS:
    raise SystemExit(3)
if rc != -1 or err != errno.EPERM:
    raise SystemExit(2)
rc, err = call(425)
if rc != -1 or err != errno.EPERM:
    raise SystemExit(4)
raise SystemExit(0)
`
	cmd := exec.Command("python3", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	err := cmd.Run()
	if err == nil {
		return
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 3 {
		t.Skip("kernel returned ENOSYS for the x32 syscall")
	}
	t.Fatalf("x32 or io_uring was not refused: %v", err)
}

func TestCheckerRefusesADatagramSocketpair(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp("/var/tmp", "cr-dgram-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	path := filepath.Join(dir, "gram.sock")
	pathLn, err := net.ListenPacket("unixgram", path)
	if err != nil {
		t.Fatal(err)
	}
	defer pathLn.Close()
	abstract := "\x00cr-dgram-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	absLn, err := net.ListenPacket("unixgram", abstract)
	if err != nil {
		t.Fatal(err)
	}
	defer absLn.Close()
	ws, _ := prepareCheckerFixture(t)
	if err := os.WriteFile(filepath.Join(ws.Scratch, "abstract-name"), []byte(abstract), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("python3", "-c", `import errno, socket, sys
path = sys.argv[1]
abstract = open("scratch/abstract-name","rb").read()
try:
    socket.socketpair(socket.AF_UNIX, socket.SOCK_DGRAM)
except OSError as e:
    if e.errno != errno.EPERM:
        raise SystemExit(4)
else:
    raise SystemExit(2)
a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET|socket.SOCK_CLOEXEC)
a.send(b"q")
if b.recv(1) != b"q":
    raise SystemExit(5)
raise SystemExit(0)
`, path)
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("datagram socketpair was not refused, or a seqpacket pair failed: %v", err)
	}
	buf := make([]byte, 32)
	for _, ln := range []net.PacketConn{pathLn, absLn} {
		_ = ln.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
		if _, _, err := ln.ReadFrom(buf); err == nil {
			t.Fatal("a host datagram listener received a packet")
		}
	}
}

func TestCheckerProcDoesNotReachHostProcesses(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	marker := filepath.Join("/tmp", fmt.Sprintf("controlrod-proc-marker-%d", os.Getpid()))
	if err := os.WriteFile(marker, []byte("host-marker\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove(marker) })
	// A fresh pid namespace has no host pid. /proc/<host-pid>/root and
	// /proc/<host-pid>/fd used to reach a writable host mount.
	script := fmt.Sprintf(`found=0
if [ -e /proc/%d/root ] || [ -e /proc/%d/fd ]; then found=1; fi
for d in /proc/[0-9]*; do
  if grep -q host-marker "$d/root%s" 2>/dev/null; then found=1; fi
done
echo "$found" > scratch/evidence/status
`, os.Getpid(), os.Getpid(), marker)
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	status, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", "status"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(status)) != "0" {
		t.Fatal("a /proc/<pid>/root or fd path reached the host marker")
	}
}

func TestCheckerMountRestoresTheStagedRuntimeAndSkipsAnEmptyVerifiedPath(t *testing.T) {
	if err := os.MkdirAll(StageRoot(), 0o700); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	argv, err := checkerMountArgv(exec.Command("/bin/true"), ws)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(argv, "\n")
	if !strings.Contains(joined, "--unshare-pid") || !strings.Contains(joined, "--proc\n/proc") {
		t.Fatalf("pid namespace or fresh procfs missing: %q", argv)
	}
	if !strings.Contains(joined, "--ro-bind\n"+StageRoot()+"\n"+StageRoot()) {
		t.Fatalf("staged runtime root was not mounted read-only: %q", argv)
	}
	if strings.Contains(joined, "--ro-bind-fd") {
		t.Fatal("an empty verified path still bound a descriptor")
	}
	fdCmd := exec.Command("/proc/self/fd/3")
	if _, err := checkerMountArgv(fdCmd, ws); err == nil {
		t.Fatal("a descriptor command with no verified path was mounted")
	}
}

func TestCheckerMountKeepsHostCredentialsReadOnly(t *testing.T) {
	for _, tc := range []struct {
		runtime, env, name string
	}{
		{RuntimeClaude, "CLAUDE_CONFIG_DIR", ".credentials.json"},
		{RuntimeCodex, "CODEX_HOME", "auth.json"},
	} {
		t.Run(tc.runtime, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv(tc.env, root)
			credential := filepath.Join(root, tc.name)
			if err := os.WriteFile(credential, []byte("fixture"), 0o600); err != nil {
				t.Fatal(err)
			}
			ws, _ := prepareCheckerFixture(t)
			ws.CheckerRuntime = tc.runtime
			script := `test "$(cat "$CLAUDE_CONFIG_DIR/.credentials.json")" = fixture`
			if tc.runtime == RuntimeCodex {
				// A refreshed sign-in is saved to the private copy; the host file is unchanged.
				script = `test "$(cat "$CODEX_HOME/auth.json")" = fixture && printf refreshed > "$CODEX_HOME/auth.json" && touch "$CODEX_HOME/checker-state"`
			}
			cmd := exec.Command("/bin/sh", "-c", script)
			cmd.Dir = ws.Dir
			cmd.Env = os.Environ()
			t.Cleanup(func() {
				if ws.Seccomp != nil {
					_ = ws.Seccomp.Close()
				}
				if ws.LoginDisposable != "" {
					_ = os.RemoveAll(ws.LoginDisposable)
				}
			})
			if err := applyCheckerMount(cmd, ws); err != nil {
				t.Fatal(err)
			}
			joined := strings.Join(cmd.Args, "\n")
			if !strings.Contains(joined, "--ro-bind\n"+root+"\n"+root+"\n") {
				t.Fatal("host login directory lacks a read-only bind")
			}
			if strings.Contains("\n"+joined, "\n--bind\n"+credential+"\n") {
				t.Fatal("host credential has a writable bind")
			}
			home := envAny(cmd, tc.env)
			if tc.runtime == RuntimeCodex {
				if home == root || !strings.Contains(joined, "\n--bind\n"+home+"\n"+home+"\n") {
					t.Fatal("isolated login state lacks a writable bind")
				}
				if strings.Contains(joined, "\n"+credential+"\n"+filepath.Join(home, tc.name)+"\n") {
					t.Fatal("the host credential is bound into the isolated login home instead of copied")
				}
			}
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("reading the fixture credential or creating disposable state failed: %v\n%s", err, output)
			}
			if tc.runtime == RuntimeCodex {
				if _, err := os.Stat(filepath.Join(home, "checker-state")); err != nil {
					t.Fatal(err)
				}
				if b, err := os.ReadFile(credential); err != nil || string(b) != "fixture" {
					t.Fatalf("host credential changed: %q %v", b, err)
				}
			}
		})
	}
}

func TestCheckerCannotRewriteLoginInstructions(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	outside, err := os.MkdirTemp("/var/tmp", "cr-login-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(outside) })
	for _, parent := range []string{t.TempDir(), outside} {
		t.Run(filepath.Base(parent), func(t *testing.T) {
			assertLoginWritesStayOffTheHost(t, parent)
		})
	}
}

func assertLoginWritesStayOffTheHost(t *testing.T, parent string) {
	t.Helper()
	claudeDir := filepath.Join(parent, "claude")
	codexDir := filepath.Join(parent, "codex")
	if err := os.MkdirAll(filepath.Join(claudeDir, "projects", "other", "memory"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "projects", "other", "memory", "MEMORY.md"), []byte("keep\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "CLAUDE.md"), []byte("do not change\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(codexDir, "config.toml"), []byte("sandbox_mode = \"read-only\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(codexDir, "AGENTS.md"), []byte("do not change\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", claudeDir)
	t.Setenv("CODEX_HOME", codexDir)
	ws, _ := prepareCheckerFixture(t)
	ws.CheckerRuntime = RuntimeClaude
	ws.LoginRoot = claudeDir
	before, err := hashProtected(claudeDir)
	if err != nil {
		t.Fatal(err)
	}
	ws.LoginDigest = before
	script := `mkdir -p "$CLAUDE_CONFIG_DIR/projects/other/memory"
echo pwn > "$CLAUDE_CONFIG_DIR/projects/other/memory/MEMORY.md"; echo M:$? > scratch/evidence/m
echo new > "$CLAUDE_CONFIG_DIR/projects/other/memory/new.md"
echo pwn > "$CLAUDE_CONFIG_DIR/settings.json"; echo C:$? > scratch/evidence/c
echo pwn > "$CLAUDE_CONFIG_DIR/CLAUDE.md"; echo D:$? > scratch/evidence/d
echo pwn > "$CLAUDE_CONFIG_DIR/CLAUDE.local.md"; echo L:$? > scratch/evidence/l
mkdir "$CLAUDE_CONFIG_DIR/hooks"; echo H:$? > scratch/evidence/h
echo pwn > "$CODEX_HOME/config.toml"; echo X:$? > scratch/evidence/x
echo pwn > "$CODEX_HOME/AGENTS.md"; echo A:$? > scratch/evidence/a
printf '%s' '{"outcome":"pass","findings":[]}' > scratch/verification.json`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "CLAUDE_CONFIG_DIR="+claudeDir, "CODEX_HOME="+codexDir)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	argv := strings.Join(cmd.Args, "\n")
	if !strings.Contains(argv, "--ro-bind\n"+claudeDir+"\n"+claudeDir) {
		t.Fatalf("login root was not mounted read-only: %q", cmd.Args)
	}
	if strings.Contains(argv, "--dir\n") || strings.Contains(argv, "--bind\n"+filepath.Join(claudeDir, "projects")+"\n") {
		t.Fatalf("real projects directory is writable: %q", cmd.Args)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"c", "d", "l", "h", "x", "a"} {
		b, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", name))
		if err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(strings.TrimSpace(string(b)), ":0") {
			t.Fatalf("%s write succeeded: %s", name, b)
		}
	}
	mem, err := os.ReadFile(filepath.Join(claudeDir, "projects", "other", "memory", "MEMORY.md"))
	if err != nil || string(mem) != "keep\n" {
		t.Fatalf("project memory changed: %q %v", mem, err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "projects", "other", "memory", "new.md")); !os.IsNotExist(err) {
		t.Fatalf("new memory file landed on the host: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "CLAUDE.local.md")); !os.IsNotExist(err) {
		t.Fatalf("absent CLAUDE.local.md was created: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "hooks")); !os.IsNotExist(err) {
		t.Fatalf("absent hooks directory was created: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(claudeDir, "settings.json"))
	if err != nil || string(got) != "{}\n" {
		t.Fatalf("claude settings changed: %q", got)
	}
	tree, cwd := checkerBaseline(t, ws)
	res := settleChecker(ws, tree, cwd, time.Now())
	if !res.Counts {
		t.Fatal(res.Error)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "CLAUDE.local.md"), []byte("planted\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	res = settleChecker(ws, tree, cwd, time.Now())
	assertVoid(t, res, "login instructions")
}

func TestCheckerSessionSymlinkDoesNotGrantHomeWrites(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(home, filepath.Join(codexDir, "sessions")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_HOME", codexDir)
	ws, _ := prepareCheckerFixture(t)
	ws.CheckerRuntime = RuntimeCodex
	plan, err := planCheckerLogin(ws)
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range plan.Overlays {
		if o.Dest == filepath.Join(codexDir, "sessions") {
			t.Fatal("a symlinked session directory was mounted")
		}
	}
	paths, err := checkerSeatbeltPaths(plan)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if p == home || strings.HasPrefix(p, home+string(os.PathSeparator)) && !strings.HasPrefix(p, codexDir+string(os.PathSeparator)) {
			t.Fatalf("seatbelt would allow %s", p)
		}
	}
	script := `echo pwn > "$CODEX_HOME/sessions/pwned"; echo S:$? > scratch/evidence/s
printf '%s' '{"outcome":"pass","findings":[]}' > scratch/verification.json`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "CODEX_HOME="+codexDir)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(home, "pwned")); !os.IsNotExist(err) {
		t.Fatalf("symlink granted a write in the home directory: %v", err)
	}
}

func TestPreparedCheckerThroughTheMount(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	before, cwd := checkerBaseline(t, ws)
	criterion := `{"package_id":"WP-0007","package_revision":2,"release_manifest_digest":{"algorithm":"sha256","value":"` + strings.Repeat("ab", 32) + `"},"results":[{"criterion_id":"C1","outcome":"pass","check_results":[{"check_id":"K1","outcome":"pass","evidence_refs":[]}],"finding_refs":[]}]}`
	script := "mkdir -p scratch/evidence; printf '%s' 'Independent review log' > scratch/evidence/checks.md; printf '%s' '" + `{"outcome":"pass","findings":[]}` + "' > scratch/verification.json; printf '%s' '" + criterion + "' > scratch/criterion-results.json"
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("mount launch: %v", err)
	}
	res := settleChecker(ws, before, cwd, time.Now())
	if !res.Counts {
		t.Fatal(res.Error)
	}
	if string(res.Verification) != `{"outcome":"pass","findings":[]}` {
		t.Fatalf("verification %s", res.Verification)
	}
	if string(res.Criterion) != criterion {
		t.Fatalf("criterion %s", res.Criterion)
	}
	if len(res.Evidence) != 1 || res.Evidence[0].Name != "evidence/checks.md" {
		t.Fatalf("evidence %+v", res.Evidence)
	}
	raw, err := base64.StdEncoding.DecodeString(res.Evidence[0].ContentBase64)
	if err != nil || string(raw) != "Independent review log" {
		t.Fatalf("evidence bytes %q %v", raw, err)
	}
}
