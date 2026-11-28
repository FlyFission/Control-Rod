package runner

import (
	"strings"
	"testing"
)

// The vendor-family table in models.json is the only one: the daemon reads it here and the
// control plane passes it to the kernel (change record kernel-boundary).
func TestModelsJSONHoldsTheOneVendorFamilyTable(t *testing.T) {
	reg, err := DefaultModels()
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Families) == 0 {
		t.Fatal("models.json has no families table")
	}
	for name, family := range reg.Families {
		if RuntimeFor(name) != name {
			t.Errorf("family key %q is not a runtime name", name)
		}
		if strings.TrimSpace(family) == "" {
			t.Errorf("runtime %q has a blank family", name)
		}
	}
	for _, m := range reg.Models {
		if RuntimeFamily(m.Harness) == "" {
			t.Errorf("model %s runs on %s, which has no family in models.json", m.ID, m.Harness)
		}
	}
	for _, multi := range []string{RuntimeOpenCode, RuntimeOllama} {
		if _, ok := reg.Families[multi]; ok {
			t.Errorf("%s can serve any vendor's model and must have no fixed family", multi)
		}
	}
}

func TestRuntimeFamilyResolvesAliasesThroughTheTable(t *testing.T) {
	for alias, want := range map[string]string{
		"anthropic": "Anthropic", " Claude ": "Anthropic", "openai": "OpenAI",
		"codex": "OpenAI", "opencode": "", "ollama": "", "nobody": "",
	} {
		if got := RuntimeFamily(alias); got != want {
			t.Errorf("RuntimeFamily(%q) = %q, want %q", alias, got, want)
		}
	}
}

// The Subscriptions page shows each adapter's own family label. For a runtime in the table the
// label must be the table's family, so the page never names a family the checks do not use.
func TestAdapterFamilyLabelsMatchTheTable(t *testing.T) {
	reg, err := DefaultModels()
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range registry {
		want, inTable := reg.Families[a.ID()]
		if !inTable {
			continue
		}
		if got := familyOf(a); got != "" && got != want {
			t.Errorf("adapter %s labels its family %q, the table says %q", a.ID(), got, want)
		}
	}
}
