//go:build linux

package runner

import (
	"bytes"
	"context"
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
	bpfJgeK  = 0x35 // BPF_JMP|BPF_JGE|BPF_K
	bpfAndK  = 0x54 // BPF_ALU|BPF_AND|BPF_K
	bpfRetK  = 0x06 // BPF_RET|BPF_K

	seccompRetKill  = 0x80000000 // SECCOMP_RET_KILL_PROCESS
	seccompRetErrno = 0x00050000 // SECCOMP_RET_ERRNO
	seccompRetAllow = 0x7fff0000 // SECCOMP_RET_ALLOW
	errnoPerm       = 1          // EPERM

	auditArchX86_64  = 0xc000003e
	auditArchAarch64 = 0xc00000b7

	// Syscall numbers from the kernel headers on this machine:
	// x86_64 asm/unistd_64.h and asm-generic/unistd.h (aarch64 uses that table).
	// io_uring_setup, io_uring_enter and io_uring_register are 425, 426 and 427
	// in both tables.
	sysSocketAMD64     = 41
	sysSocketARM64     = 198
	sysSocketpairAMD64 = 53
	sysSocketpairARM64 = 199
	sysIoUringSetup    = 425
	sysIoUringEnter    = 426
	sysIoUringReg      = 427

	// __X32_SYSCALL_BIT. An x32 syscall uses AUDIT_ARCH_X86_64 with this bit
	// set in the number, so it must be rejected before the native dispatch.
	x32SyscallBit = 0x40000000

	afUnix        = 1
	sockStream    = 1
	sockDgram     = 2
	sockSeqpacket = 5
	sockNonblock  = 2048   // SOCK_NONBLOCK, 04000
	sockCloexec   = 524288 // SOCK_CLOEXEC, 02000000
	sockTypeKeep  = ^uint32(sockNonblock | sockCloexec)
)

// unixSocketFilter is the checker's seccomp program. bubblewrap reads it as a
// raw array of sock_filter instructions (a multiple of 8 bytes).
//
// socket(AF_UNIX) returns EPERM, on a path or an abstract address. An x32
// syscall number (nr >= 0x40000000) shares AUDIT_ARCH_X86_64 with the native
// ABI, so it is rejected before dispatch; that also covers the i386 socketcall
// path when it is presented as an x32 number. io_uring_setup, io_uring_enter
// and io_uring_register return EPERM, because IORING_OP_SOCKET creates an
// AF_UNIX socket without syscall 41 or 198.
//
// socketpair(AF_UNIX) is allowed only for SOCK_STREAM and SOCK_SEQPACKET, with
// SOCK_NONBLOCK and SOCK_CLOEXEC ignored. Those two types are connection
// oriented: connect on an already-connected end returns EISCONN (errno 106 on
// this kernel), so the end cannot be pointed at a host listener. SOCK_DGRAM
// can connect or sendto again, so it returns EPERM. A socketpair in any other
// domain is allowed, which is what the previous filter did for every
// socketpair. Node and libuv create an AF_UNIX SOCK_STREAM pair for stdio.
//
// accept and accept4 are not denied. The checker inherits standard input,
// output and error, the verified executable when one is open, and this filter
// file. None of those is a listening socket, and Go marks every other file
// descriptor close-on-exec, so the sandbox does not receive one. The filter
// file is closed by bubblewrap after it is read. pidfd_getfd cannot see a host
// process because the checker is in a new pid namespace, and bubblewrap does
// not hold an AF_UNIX socket. Opening a socket inode with open returns ENXIO
// and does not produce a usable endpoint.
func unixSocketFilter(goarch string) ([]byte, error) {
	var arch, sysSocket, sysSocketpair uint32
	switch goarch {
	case "amd64":
		arch, sysSocket, sysSocketpair = auditArchX86_64, sysSocketAMD64, sysSocketpairAMD64
	case "arm64":
		arch, sysSocket, sysSocketpair = auditArchAarch64, sysSocketARM64, sysSocketpairARM64
	default:
		return nil, fmt.Errorf("this CPU (%s) has no Unix-socket filter, so the check cannot count", goarch)
	}
	// seccomp_data: nr at 0, arch at 4, args[0] at 16, args[1] low at 24, high at 28.
	//  0 ld arch
	//  1 jeq arch -> 3, else 2
	//  2 ret kill
	//  3 ld nr
	//  4 jge x32 -> 5, else 6
	//  5 ret EPERM
	//  6 jeq socket -> 7, else 11
	//  7 ld domain
	//  8 jeq AF_UNIX -> 9, else 10
	//  9 ret EPERM
	// 10 ret allow
	// 11 jeq socketpair -> 12, else 25
	// 12 ld domain
	// 13 jeq AF_UNIX -> 15, else 14
	// 14 ret allow
	// 15 ld type high
	// 16 jeq 0 -> 18, else 17
	// 17 ret EPERM
	// 18 ld type low
	// 19 and keep-mask
	// 20 jeq STREAM -> 21, else 22
	// 21 ret allow
	// 22 jeq SEQPACKET -> 23, else 24
	// 23 ret allow
	// 24 ret EPERM
	// 25 jeq io_uring_setup -> 26, else 27
	// 26 ret EPERM
	// 27 jeq io_uring_enter -> 28, else 29
	// 28 ret EPERM
	// 29 jeq io_uring_register -> 30, else 31
	// 30 ret EPERM
	// 31 ret allow
	insns := []sockFilter{
		{code: bpfLdAbs, k: 4},
		{code: bpfJeqK, jt: 1, jf: 0, k: arch},
		{code: bpfRetK, k: seccompRetKill},
		{code: bpfLdAbs, k: 0},
		{code: bpfJgeK, jt: 0, jf: 1, k: x32SyscallBit},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfJeqK, jt: 0, jf: 4, k: sysSocket},
		{code: bpfLdAbs, k: 16},
		{code: bpfJeqK, jt: 0, jf: 1, k: afUnix},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfRetK, k: seccompRetAllow},
		{code: bpfJeqK, jt: 0, jf: 13, k: sysSocketpair},
		{code: bpfLdAbs, k: 16},
		{code: bpfJeqK, jt: 1, jf: 0, k: afUnix},
		{code: bpfRetK, k: seccompRetAllow},
		{code: bpfLdAbs, k: 28},
		{code: bpfJeqK, jt: 1, jf: 0, k: 0},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfLdAbs, k: 24},
		{code: bpfAndK, k: sockTypeKeep},
		{code: bpfJeqK, jt: 0, jf: 1, k: sockStream},
		{code: bpfRetK, k: seccompRetAllow},
		{code: bpfJeqK, jt: 0, jf: 1, k: sockSeqpacket},
		{code: bpfRetK, k: seccompRetAllow},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfJeqK, jt: 0, jf: 1, k: sysIoUringSetup},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfJeqK, jt: 0, jf: 1, k: sysIoUringEnter},
		{code: bpfRetK, k: seccompRetErrno | errnoPerm},
		{code: bpfJeqK, jt: 0, jf: 1, k: sysIoUringReg},
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
	ctx, cancel := context.WithTimeout(context.Background(), probeTimeout)
	defer cancel()
	help := exec.CommandContext(ctx, path, "--help")
	help.WaitDelay = probeWaitDelay
	out, err := help.CombinedOutput()
	if !bytes.Contains(out, []byte("--seccomp")) {
		if err != nil {
			return fmt.Errorf("bubblewrap did not offer --seccomp (%v), so the check cannot count", err)
		}
		return fmt.Errorf("bubblewrap has no --seccomp, so the check cannot count")
	}
	return nil
}
