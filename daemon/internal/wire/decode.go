// Package wire validates complete raw control-plane responses before internal projection.
package wire

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"sync"

	"github.com/flyfission/control-rod/daemon/internal/digest"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:generate node ../../../scripts/generate-runner-schemas.mjs
//go:embed schemas/*.json
var schemas embed.FS
var once sync.Once
var compiled map[string]*jsonschema.Schema
var compileErr error

func load() {
	c := jsonschema.NewCompiler()
	c.AssertFormat()
	entries, err := schemas.ReadDir("schemas")
	if err != nil {
		compileErr = err
		return
	}
	for _, e := range entries {
		raw, err := schemas.ReadFile("schemas/" + e.Name())
		if err != nil {
			compileErr = err
			return
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			compileErr = err
			return
		}
		if err = c.AddResource("https://controlrod.test/"+e.Name(), doc); err != nil {
			compileErr = err
			return
		}
	}
	compiled = make(map[string]*jsonschema.Schema)
	for _, name := range []string{"Job.json", "LogReply.json", "CompletionReceipt.json"} {
		s, err := c.Compile("https://controlrod.test/" + name)
		if err != nil {
			compileErr = err
			return
		}
		compiled[name] = s
	}
}

// Decode refuses over-budget bodies, ambiguous JSON and schema-invalid complete records.
func Decode(r io.Reader, schema string, limit int64, out any) error {
	raw, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return err
	}
	if int64(len(raw)) > limit {
		return fmt.Errorf("wire response exceeds %d bytes", limit)
	}
	if _, err = digest.CanonicalSHA256(raw); err != nil {
		return fmt.Errorf("wire JSON profile: %w", err)
	}
	once.Do(load)
	if compileErr != nil {
		return fmt.Errorf("wire schemas: %w", compileErr)
	}
	s, ok := compiled[schema]
	if !ok {
		return fmt.Errorf("unknown wire schema %q", schema)
	}
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	if err = s.Validate(doc); err != nil {
		return fmt.Errorf("wire %s: %w", schema, err)
	}
	return json.Unmarshal(raw, out)
}
