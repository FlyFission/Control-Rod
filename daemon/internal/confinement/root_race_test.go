//go:build linux

package confinement

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
)

func TestReviewRootAliasRace(t *testing.T) {
	f := setup(t)
	root := filepath.Dir(f.in)
	held := f.in + "-held"
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			if os.Rename(f.in, held) != nil {
				continue
			}
			_ = os.Symlink(root, f.in)
			runtime.Gosched()
			_ = os.Remove(f.in)
			_ = os.Rename(held, f.in)
			runtime.Gosched()
		}
	}()
	defer func() { close(stop); wg.Wait() }()
	rootInfo, _ := os.Stat(root)
	for i := 0; i < 20000; i++ {
		b, err := Open(context.Background(), f.options)
		if err != nil {
			continue
		}
		h, err := b.input.Open(".")
		if err != nil {
			b.Close()
			continue
		}
		info, err := h.Stat()
		h.Close()
		b.Close()
		if err == nil && os.SameFile(info, rootInfo) {
			t.Fatalf("Open admitted input containing output after EvalSymlinks race (attempt %d)", i)
		}
	}
}
