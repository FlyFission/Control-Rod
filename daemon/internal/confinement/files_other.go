//go:build !linux

package confinement

import "os"

func openRegular(root *os.Root, path string) (*os.File, error) { return nil, ErrUnsupported }
