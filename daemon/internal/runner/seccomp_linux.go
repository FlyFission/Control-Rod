//go:build linux

package runner

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// Linux seccomp ABI. These are the kernel's values, not measurements:
// struct sock_filter is 8 bytes; AUDIT_ARCH_* comes from linux/audit.h;
// __NR_socket is 41 on x86_64 (asm/unistd_64.h) and 198 on aarch64
// (asm-generic/unistd.h); SECCOMP_RET_* and EPERM are the seccomp ABI.
const (
	bpfLdAbs = 0x20 // BPF_LD|BPF_W|BPF_ABS
	bpfJeqK  = 0x15 // BPF_JMP|BPF_JEQ|BPF_K
	bpfRetK  = 0x06 // BPF_RET|BPF_K

	seccompRetKill  = 0x80000000 // SECCOMP_RET_KILL_PROCESS
	seccompRetErrno = 0x00050000 // SECCOMP_RET_ERRNO
	seccompRetAllow = 0x7fff0000 // SECCOMP_RET_ALLOW
	errnoPerm       = 1          // EPERM

	auditArchX86_64  = 0xc000003e
	auditArchAarch64 = 0xc00000b7
	sysSocketAMD64   = 41
	sysSocketARM64   = 198

	afUnix = 1
)

// unixSocketFilter is a seccomp BPF program that makes socket(AF_UNIX, ...)
// return EPERM. socketpair is a different syscall and is allowed, because
// Node and libuv use it for stdio and pipes. AF_INET and AF_INET6 stay
// allowed so the CLIs can open HTTPS. bubblewrap reads the file as a raw
// array of sock_filter instructions and requires a multiple of 8 bytes.
func unixSocketFilter(goarch string) ([]byte, error) {
	var arch, sysSocket uint32
	switch goarch {
	case "amd64":
		arch, sysSocket = auditArchX86_64, sysSocketAMD64
	case "arm64":
		arch, sysSocket = auditArchAarch64, sysSocketARM64
	default:
		return nil, fmt.Errorf("this CPU (%s) has no Unix-socket filter, so the check cannot count", goarch)
	}
	// seccomp_data: nr at 0, arch at 4, args[0] at 16.
	// 0 ld arch
	// 1 jeq arch -> 3, else 2
	// 2 ret kill
	// 3 ld nr
	// 4 jeq socket -> 6, else 5
	// 5 ret allow
	// 6 ld args[0]
	// 7 jeq AF_UNIX -> 8, else 9
	// 8 ret EPERM
	// 9 ret allow
	insns := []sockFilter{
		{code: bpfLdAbs, k: 4},
		{code: bpfJeqK, jt: 1, jf: 0, k: arch},
		{code: bpfRetK, k: seccompRetKill},
		{code: bpfLdAbs, k: 0},
		{code: bpfJeqK, jt: 1, jf: 0, k: sysSocket},
		{code: bpfRetK, k: seccompRetAllow},
		{code: bpfLdAbs, k: 16},
		{code: bpfJeqK, jt: 0, jf: 1, k: afUnix},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfRetK, k: seccompRetAllow},
	}
	buf := make([]byte, 0, len(insns)*8)
	for _, insn := range insns {
		buf = append(buf, insn.bytes()...)
	}
	if len(buf)%8 != 0 {
		return nil, fmt.Errorf("the Unix-socket filter is not a whole number of instructions, so the check cannot count")
	}
	return buf, nil
}

type sockFilter struct {
	code uint16
	jt   uint8
	jf   uint8
	k    uint32
}

func (f sockFilter) bytes() []byte {
	var b [8]byte
	binary.LittleEndian.PutUint16(b[0:2], f.code)
	b[2] = f.jt
	b[3] = f.jf
	binary.LittleEndian.PutUint32(b[4:8], f.k)
	return b[:]
}

// seccompFilterFile writes the filter for this machine. The name is removed
// so only the open descriptor remains. bubblewrap reads that descriptor.
func seccompFilterFile() (*os.File, error) {
	raw, err := unixSocketFilter(runtime.GOARCH)
	if err != nil {
		return nil, err
	}
	f, err := os.CreateTemp("", "controlrod-seccomp-")
	if err != nil {
		return nil, fmt.Errorf("cannot create the Unix-socket filter (%v), so the check cannot count", err)
	}
	if err := os.Remove(f.Name()); err != nil {
		f.Close()
		return nil, err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return nil, err
	}
	if _, err := f.Seek(0, 0); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}

func bwrapHasSeccomp(path string) error {
	out, err := exec.Command(path, "--help").CombinedOutput()
	if !bytes.Contains(out, []byte("--seccomp")) {
		if err != nil {
			return fmt.Errorf("bubblewrap did not offer --seccomp (%v), so the check cannot count", err)
		}
		return fmt.Errorf("bubblewrap has no --seccomp, so the check cannot count")
	}
	return nil
}
