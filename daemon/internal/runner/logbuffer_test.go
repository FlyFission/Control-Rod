package runner

import (
	"fmt"
	"strings"
	"testing"
)

func TestTakeKeepsEveryLineInAPISizedBatches(t *testing.T) {
	b := &logBuffer{}
	for i := 0; i < 1201; i++ {
		b.add(fmt.Sprintf("line-%d", i))
	}
	seen := 0
	for _, wantSize := range []int{500, 500, 201} {
		batch, ok := b.take()
		if !ok || len(batch.Lines) != wantSize {
			t.Fatalf("batch has %d lines, want %d", len(batch.Lines), wantSize)
		}
		for _, line := range batch.Lines {
			if line != fmt.Sprintf("line-%d", seen) {
				t.Fatalf("line %d: %q", seen, line)
			}
			seen++
		}
	}
	if _, ok := b.take(); ok {
		t.Fatal("buffer still dirty after all lines were taken")
	}
}

func TestTakeDoesNotCombineLargeLinesIntoOversizedUploads(t *testing.T) {
	b := &logBuffer{}
	b.add(strings.Repeat("a", 700000))
	b.add(strings.Repeat("b", 700000))
	for _, first := range []byte{'a', 'b'} {
		batch, ok := b.take()
		if !ok || len(batch.Lines) != 1 || batch.Lines[0][0] != first {
			t.Fatalf("large line was lost, reordered or combined: %d lines", len(batch.Lines))
		}
	}
}

func TestPutBackKeepsFailedBatchFirst(t *testing.T) {
	b := &logBuffer{}
	b.add("one")
	b.add("two")
	batch, ok := b.take()
	if !ok || len(batch.Lines) != 2 {
		t.Fatalf("take: %v %v", ok, batch.Lines)
	}
	b.add("three")
	b.putBack(batch.Lines)
	again, ok := b.take()
	if !ok {
		t.Fatal("buffer should be dirty after putBack")
	}
	want := []string{"one", "two", "three"}
	if len(again.Lines) != len(want) {
		t.Fatalf("got %v want %v", again.Lines, want)
	}
	for i := range want {
		if again.Lines[i] != want[i] {
			t.Fatalf("got %v want %v", again.Lines, want)
		}
	}
}

func TestPutBackIsBounded(t *testing.T) {
	b := &logBuffer{}
	big := make([]string, maxHeldLines+5)
	for i := range big {
		big[i] = "x"
	}
	b.putBack(big)
	count := 0
	for {
		got, ok := b.take()
		if !ok {
			break
		}
		count += len(got.Lines)
	}
	if count != maxHeldLines {
		t.Fatalf("held %d lines, want %d", count, maxHeldLines)
	}
}

func TestTakeSendsAtMostOneBatchAndKeepsTheRest(t *testing.T) {
	b := &logBuffer{}
	for range MaxLogBatch + 7 {
		b.add("l")
	}
	first, _ := b.take()
	second, ok := b.take()
	if len(first.Lines) != MaxLogBatch || !ok || len(second.Lines) != 7 {
		t.Fatalf("first %d, second %d (ok %v)", len(first.Lines), len(second.Lines), ok)
	}
	if _, ok := b.take(); ok {
		t.Fatal("buffer should be empty")
	}
}
