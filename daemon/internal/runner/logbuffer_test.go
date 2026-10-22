package runner

import "testing"

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
	if len(b.lines) != maxHeldLines {
		t.Fatalf("held %d lines, want %d", len(b.lines), maxHeldLines)
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
