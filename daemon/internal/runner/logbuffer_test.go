package runner

import (
	"encoding/json"
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

func TestEventsKeepStableIndexesAndLeftoversGoWithTheCompletion(t *testing.T) {
	buf := &logBuffer{}
	buf.addEvents([]Event{{Kind: EvMessage, Text: "a"}, {Kind: EvMessage, Text: "b"}})
	first, _ := buf.take()
	if first.EventsFrom != 0 || len(first.Events) != 2 {
		t.Fatalf("first batch %+v", first)
	}
	// The upload failed: the same events go again from the same index.
	buf.putBackEvents(first.Events)
	again, _ := buf.take()
	if again.EventsFrom != 0 || len(again.Events) != 2 {
		t.Fatalf("a resent batch keeps its index: %+v", again)
	}
	buf.sent(again)
	buf.addEvents([]Event{{Kind: EvExit, Text: "exited"}})
	next, _ := buf.take()
	if next.EventsFrom != 2 {
		t.Fatalf("later events keep counting: %d", next.EventsFrom)
	}
	// The final upload fails: what is left goes with the completion, at its own index.
	buf.putBackEvents(next.Events)
	left, from := buf.leftEvents()
	if from != 2 || len(left) != 1 || left[0].Kind != EvExit {
		t.Fatalf("leftovers %v from %d", left, from)
	}

	// More left than one completion carries: the newest go, placed exactly; the rest is a gap.
	buf = &logBuffer{}
	many := make([]Event, MaxEventBatch+10)
	for i := range many {
		many[i] = Event{Kind: EvMessage, Text: "m"}
	}
	many[len(many)-1] = Event{Kind: EvExit}
	buf.addEvents(many)
	left, from = buf.leftEvents()
	if len(left) != MaxEventBatch || from != 10 || left[len(left)-1].Kind != EvExit {
		t.Fatalf("leftovers are bounded and placed: %d from %d", len(left), from)
	}
}

func TestHeldEventOverflowLeavesAGapAndBatchesStayConsecutive(t *testing.T) {
	buf := &logBuffer{}
	many := make([]Event, maxHeldEvents+3)
	for i := range many {
		many[i] = Event{Kind: EvMessage, Text: "m"}
	}
	buf.addEvents(many)
	b, _ := buf.take()
	if b.EventsFrom != 3 || len(b.Events) != MaxEventBatch {
		t.Fatalf("the oldest three are dropped as a gap: from %d, %d events", b.EventsFrom, len(b.Events))
	}
	// A batch taken out and put back after newer events arrived still goes first, from its index.
	buf.putBackEvents(b.Events)
	again, _ := buf.take()
	if again.EventsFrom != 3 {
		t.Fatalf("from %d", again.EventsFrom)
	}
	for i, e := range again.Events {
		if e.idx != 3+i {
			t.Fatalf("event %d has index %d", i, e.idx)
		}
	}
}

func TestACompletionAlwaysSendsWhereItsEventsStart(t *testing.T) {
	b, err := json.Marshal(Completion{Status: "failed", Outputs: []NamedFile{}, Events: []Event{{Kind: EvExit}}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"events_from":0`) {
		t.Fatalf("index zero must be on the wire, or a resent completion is recorded twice: %s", b)
	}
}
