//go:build unix

package runner

import "syscall"

// syscallNoFollow refuses to open a symlink that replaced a file after it was listed.
const syscallNoFollow = syscall.O_NOFOLLOW

// syscallNonblock keeps opening a file from waiting if a FIFO replaces it.
const syscallNonblock = syscall.O_NONBLOCK
