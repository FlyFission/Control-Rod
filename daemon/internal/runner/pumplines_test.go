package runner

import (
	"io"
	"slices"
	"strings"
	"testing"
	"time"
)

// A line longer than the limit is left out with a notice and reading goes on, so the agent is
// never left blocked on a full pipe (review DMN-7).
func TestPumpLinesSkipsALineOverTheLimitAndKeepsReading(t *testing.T) {
	input := "first\r\n" + strings.Repeat("x", 100) + "\nafter\n\nlast"
	var got []string
	var cut []int
	pumpLines(strings.NewReader(input), 10, func(l string) { got = append(got, l) }, func(n int) { cut = append(cut, n) })
	if want := []string{"first", "after", "", "last"}; !slices.Equal(got, want) {
		t.Fatalf("lines %q, want %q", got, want)
	}
	if len(cut) != 1 || cut[0] != 101 {
		t.Fatalf("cut %v", cut)
	}
}

func TestPumpLinesKeepsALineOfExactlyTheLimit(t *testing.T) {
	var got []string
	pumpLines(strings.NewReader("0123456789\n0123456789"), 10, func(l string) { got = append(got, l) }, func(int) { t.Fatal("cut") })
	if !slices.Equal(got, []string{"0123456789", "0123456789"}) {
		t.Fatalf("%q", got)
	}
}

// A writer that sends a huge line and then more output is drained to the end, not left blocked.
func TestPumpLinesDrainsAWriterPastAHugeLine(t *testing.T) {
	r, w := io.Pipe()
	go func() {
		chunk := strings.Repeat("y", 1<<16)
		for i := 0; i < 40; i++ { // 2.5 MB on one line
			_, _ = w.Write([]byte(chunk))
		}
		_, _ = w.Write([]byte("\nend\n"))
		_ = w.Close()
	}()
	done := make(chan []string)
	go func() {
		var got []string
		pumpLines(r, 1<<20, func(l string) { got = append(got, l) }, func(int) { got = append(got, "<cut>") })
		done <- got
	}()
	select {
	case got := <-done:
		if !slices.Equal(got, []string{"<cut>", "end"}) {
			t.Fatalf("%q", got)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the reader stopped at the long line")
	}
}
