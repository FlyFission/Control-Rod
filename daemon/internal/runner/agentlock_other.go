//go:build !unix

package runner

import "errors"

// ErrAgentsInUse: see agentlock_unix.go. No run starts on this platform.
var ErrAgentsInUse = errors.New("an agent CLI is in use by a run or another update")

func LockAgentsShared(string) (func(), error)       { return func() {}, nil }
func TryLockAgentsExclusive(string) (func(), error) { return func() {}, nil }
