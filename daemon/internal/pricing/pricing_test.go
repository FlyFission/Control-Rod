package pricing

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"math/big"
	"path/filepath"
	"strings"
	"testing"
)

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestVerifySHA256AndDisallowUnknownFields(t *testing.T) {
	validJSON := []byte(`{
		"schema_version": "1",
		"provider": "anthropic",
		"currency": "USD",
		"effective_date": "2026-11-01",
		"models": {
			"claude-sonnet": {
				"input_per_million": "3.00",
				"output_per_million": "15.00",
				"cached_input_per_million": "0.30"
			}
		}
	}`)
	digest := sha256Hex(validJSON)

	// Hash mismatch must be rejected.
	if _, err := LoadProviderBlob(ProviderBlobSpec{
		Provider:       "anthropic",
		Data:           validJSON,
		ExpectedSHA256: strings.Repeat("0", 64),
	}); !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("expected ErrDigestMismatch, got %v", err)
	}

	// Unknown JSON field must be rejected by DisallowUnknownFields().
	unknownFieldJSON := []byte(`{
		"schema_version": "1",
		"provider": "anthropic",
		"currency": "USD",
		"effective_date": "2026-11-01",
		"unexpected_field": true,
		"models": {
			"claude-sonnet": {
				"input_per_million": "3.00",
				"output_per_million": "15.00"
			}
		}
	}`)
	if _, err := LoadProviderBlob(ProviderBlobSpec{
		Provider:       "anthropic",
		Data:           unknownFieldJSON,
		ExpectedSHA256: sha256Hex(unknownFieldJSON),
	}); !errors.Is(err, ErrInvalidCatalog) {
		t.Fatalf("expected ErrInvalidCatalog for unknown field, got %v", err)
	}

	// Valid blob succeeds.
	pc, err := LoadProviderBlob(ProviderBlobSpec{
		Provider:       "anthropic",
		Data:           validJSON,
		ExpectedSHA256: digest,
	})
	if err != nil {
		t.Fatalf("LoadProviderBlob failed: %v", err)
	}
	if pc.Models["claude-sonnet"].InputPerMillion.Cmp(big.NewRat(3, 1)) != 0 {
		t.Fatalf("unexpected input rate: %v", pc.Models["claude-sonnet"].InputPerMillion)
	}
}

func TestStrictDecimalParsingRejectsMalformedNumbers(t *testing.T) {
	badDecimals := []string{
		"",
		"01",
		"00.5",
		".5",
		"5.",
		"-1.0",
		"+1.0",
		"1e-5",
		"1.2.3",
		"NaN",
		"Infinity",
		" 1.0",
	}
	for _, bad := range badDecimals {
		if _, err := ParseDecimalRat(bad); !errors.Is(err, ErrInvalidDecimal) {
			t.Fatalf("ParseDecimalRat(%q) expected ErrInvalidDecimal, got %v", bad, err)
		}
	}

	// Classic binary-float trap: 0.1 + 0.2 == 0.3 exactly in *big.Rat.
	r1, err := ParseDecimalRat("0.1")
	if err != nil {
		t.Fatal(err)
	}
	r2, err := ParseDecimalRat("0.2")
	if err != nil {
		t.Fatal(err)
	}
	r3, err := ParseDecimalRat("0.3")
	if err != nil {
		t.Fatal(err)
	}
	sum := new(big.Rat).Add(r1, r2)
	if sum.Cmp(r3) != 0 {
		t.Fatalf("expected exact 0.1 + 0.2 == 0.3, got %s", sum.RatString())
	}
}

func TestExactRationalCostAndRounding(t *testing.T) {
	blob := []byte(`{
		"schema_version": "1",
		"provider": "openai",
		"currency": "USD",
		"effective_date": "2026-11-01",
		"models": {
			"gpt-exact": {
				"input_per_million": "0.15",
				"output_per_million": "0.60",
				"cached_input_per_million": "0.075"
			}
		}
	}`)
	cat, err := LoadCatalog([]ProviderBlobSpec{{
		Provider:       "openai",
		Data:           blob,
		ExpectedSHA256: sha256Hex(blob),
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	// 1 input token at $0.15/1M = 15 / 100_000_000 = 0.00000015
	// 1 cached token at $0.075/1M = 75 / 1_000_000_000
	cost, err := cat.EstimateCost("openai", "gpt-exact", TokenUsage{
		InputTokens:       1,
		OutputTokens:      500_000, // 0.30 exact
		CachedInputTokens: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if cost.OutputCost.Cmp(big.NewRat(3, 10)) != 0 {
		t.Fatalf("OutputCost = %s, want 3/10", cost.OutputCost.RatString())
	}

	// Exact tie rounding tests:
	// 1.25 -> half-up: 1.3, half-even: 1.2
	tieEven := big.NewRat(5, 4) // 1.25
	if got := FormatDecimalHalfUp(tieEven, 1); got != "1.3" {
		t.Fatalf("FormatDecimalHalfUp(1.25, 1) = %s, want 1.3", got)
	}
	if got := FormatDecimalHalfEven(tieEven, 1); got != "1.2" {
		t.Fatalf("FormatDecimalHalfEven(1.25, 1) = %s, want 1.2", got)
	}

	// 1.35 -> half-up: 1.4, half-even: 1.4
	tieOdd := big.NewRat(27, 20) // 1.35
	if got := FormatDecimalHalfEven(tieOdd, 1); got != "1.4" {
		t.Fatalf("FormatDecimalHalfEven(1.35, 1) = %s, want 1.4", got)
	}

	// 1/3 to 6 decimals -> 0.333333
	if got := FormatDecimalHalfEven(big.NewRat(1, 3), 6); got != "0.333333" {
		t.Fatalf("FormatDecimalHalfEven(1/3, 6) = %s, want 0.333333", got)
	}
}

func TestDeterministicOverrideVersionStamping(t *testing.T) {
	blobA := []byte(`{
		"schema_version": "1",
		"provider": "anthropic",
		"currency": "USD",
		"effective_date": "2026-11-01",
		"models": {
			"sonnet": {"input_per_million": "3.00", "output_per_million": "15.00"}
		}
	}`)
	blobB := []byte(`{
		"schema_version": "1",
		"provider": "openai",
		"currency": "USD",
		"effective_date": "2026-11-01",
		"models": {
			"gpt": {"input_per_million": "2.50", "output_per_million": "10.00"}
		}
	}`)
	specs := []ProviderBlobSpec{
		{Provider: "anthropic", Data: blobA, ExpectedSHA256: sha256Hex(blobA)},
		{Provider: "openai", Data: blobB, ExpectedSHA256: sha256Hex(blobB)},
	}

	ov1 := []Override{
		{Provider: "openai", Model: "gpt", InputPerMillion: "2.00"},
		{Provider: "anthropic", Model: "sonnet", OutputPerMillion: "12.00"},
	}
	ov2 := []Override{
		{Provider: "Anthropic", Model: "sonnet", OutputPerMillion: "12.00"},
		{Provider: "OpenAI", Model: "gpt", InputPerMillion: "2.00"},
	}

	cat1, err := LoadCatalog(specs, ov1)
	if err != nil {
		t.Fatal(err)
	}
	cat2, err := LoadCatalog(specs, ov2)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(cat1.OverrideVersion, OverrideVersionPrefix) {
		t.Fatalf("unexpected OverrideVersion prefix: %q", cat1.OverrideVersion)
	}
	if cat1.OverrideVersion != cat2.OverrideVersion {
		t.Fatalf("override version stamp must be order-independent: %s != %s", cat1.OverrideVersion, cat2.OverrideVersion)
	}

	cost, err := cat1.EstimateCost("anthropic", "sonnet", TokenUsage{OutputTokens: 1_000_000})
	if err != nil {
		t.Fatal(err)
	}
	if cost.TotalCost.Cmp(big.NewRat(12, 1)) != 0 || cost.OverrideVersion != cat1.OverrideVersion {
		t.Fatalf("unexpected overridden cost: %+v", cost)
	}
}

func TestNoFloatingPointTypesInPricingPackage(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(info fs.FileInfo) bool {
		return !strings.HasSuffix(info.Name(), "_test.go")
	}, 0)
	if err != nil {
		// Fallback to ParseFile directly if FileInfo signature differs.
		f, parseErr := parser.ParseFile(fset, filepath.Join(".", "pricing.go"), nil, 0)
		if parseErr != nil {
			t.Fatal(parseErr)
		}
		pkgs = map[string]*ast.Package{"pricing": {Name: "pricing", Files: map[string]*ast.File{"pricing.go": f}}}
	}
	for _, pkg := range pkgs {
		for fileName, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				ident, ok := n.(*ast.Ident)
				if ok && (ident.Name == "float64" || ident.Name == "float32") {
					t.Errorf("%s references forbidden floating-point type %s", fileName, ident.Name)
				}
				return true
			})
		}
	}
}
