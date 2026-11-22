//go:build unix

package gitworktree

import "syscall"

const syscallNoFollow = syscall.O_NOFOLLOW
