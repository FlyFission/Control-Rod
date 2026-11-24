package wire

import "testing"

// Every embedded schema must compile with the validator's default (RE2) regex engine,
// or every wire validation fails, including jobs that carry no findings.
func TestEmbeddedSchemasCompile(t *testing.T) {
	once.Do(load)
	if compileErr != nil {
		t.Fatalf("wire schemas do not compile: %v", compileErr)
	}
}

func TestFindingScopePaths(t *testing.T) {
	ok := `{"id":"F-001","severity":"major","text":"x","location":{"path":"src/a.ts","line":3},"scope_paths":["src/a.ts","docs/",".github/x.yml"]}`
	if err := Validate("Finding.json", []byte(ok)); err != nil {
		t.Fatalf("valid finding refused: %v", err)
	}
	for _, bad := range []string{"../x", "a/../b", "/abs", `a\\b`, "a//b", ".."} {
		doc := `{"id":"F-001","severity":"major","text":"x","scope_paths":["` + bad + `"]}`
		if err := Validate("Finding.json", []byte(doc)); err == nil {
			t.Errorf("path %q accepted", bad)
		}
	}
}
