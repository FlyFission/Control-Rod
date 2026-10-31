//go:build !linux

package runner

import (
	"errors"
	"syscall"
)

func cgroupOf(int) (string, error) { return "", errors.New("cgroups are Linux only") }

// DetectContainer uses the process group: cgroup scopes need Linux and a systemd user manager.
func DetectContainer(func(string) string) Container { return Container{Mode: ContainGroup} }

func (u Unit) cgroupAlive() bool           { return false }
func (u Unit) cgroupFreeze(bool) error     { return errors.New("cgroups are Linux only") }
func (u Unit) cgroupSignal(syscall.Signal) {}
func (u Unit) cgroupKill() error           { return errors.New("cgroups are Linux only") }
func (k Container) OrphanScopes() []Unit   { return nil }

// signalLeaderPinned has no stable process handle here, so it never signals.
func signalLeaderPinned(int, func() bool, syscall.Signal) error { return errNoIdentityToSignal }
