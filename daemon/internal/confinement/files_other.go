//go:build !linux

package confinement

import (
	"context"
	"os"
)

func openRegular(root *os.Root, path string) (*os.File, error) { return nil, ErrUnsupported }

func validateRoots(ctx context.Context, input, output *os.Root) error { return ErrUnsupported }
