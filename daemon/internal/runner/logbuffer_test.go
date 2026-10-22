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
	got, _ := b.take()
	if len(got.Lines) != maxHeldLines {
		t.Fatalf("held %d lines, want %d", len(got.Lines), maxHeldLines)
	}
}
