//go:build unix

package runner

import "syscall"

// syscallNoFollow refuses to open a symlink that replaced a file after it was listed.
const syscallNoFollow = syscall.O_NOFOLLOW
