// Package pricing loads SHA-256-verified provider pricing catalogs and computes
// exact-rational (*big.Rat) cost records without floating-point arithmetic.
package pricing

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"regexp"
	"slices"
	"strings"
)

const (
	// OverrideVersionPrefix prefixes deterministic override digest stamps.
	OverrideVersionPrefix = "cr-override:sha256:"

	// SupportedSchemaVersion is the pricing catalog schema version accepted by this loader.
	SupportedSchemaVersion = "1"
)

var (
	// ErrDigestMismatch indicates a provider blob's SHA-256 did not match ExpectedSHA256.
	ErrDigestMismatch = errors.New("pricing: provider blob SHA-256 mismatch")

	// ErrInvalidDecimal indicates a price string failed strict decimal validation.
	ErrInvalidDecimal = errors.New("pricing: invalid decimal string")

	// ErrInvalidCatalog indicates malformed catalog structure, unknown fields, or missing values.
	ErrInvalidCatalog = errors.New("pricing: invalid pricing catalog")

	// ErrModelNotFound indicates the requested (provider, model) pair is absent from the catalog.
	ErrModelNotFound = errors.New("pricing: model not found")

	// ErrInvalidUsage indicates negative token counts.
	ErrInvalidUsage = errors.New("pricing: negative token usage")
)

var (
	strictDecimalRe = regexp.MustCompile(`^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`)
	sha256HexRe     = regexp.MustCompile(`^[0-9a-f]{64}$`)
	oneMillion      = big.NewInt(1_000_000)
)

// ProviderBlobSpec identifies one raw provider pricing JSON blob and its expected SHA-256.
type ProviderBlobSpec struct {
	Provider       string
	Data           []byte
	ExpectedSHA256 string
}

type rawProviderCatalog struct {
	SchemaVersion string                     `json:"schema_version"`
	Provider      string                     `json:"provider"`
	Currency      string                     `json:"currency"`
	EffectiveDate string                     `json:"effective_date"`
	Models        map[string]rawModelPricing `json:"models"`
}

type rawModelPricing struct {
	InputPerMillion       string `json:"input_per_million"`
	OutputPerMillion      string `json:"output_per_million"`
	CachedInputPerMillion string `json:"cached_input_per_million,omitempty"`
	CacheWritePerMillion  string `json:"cache_write_per_million,omitempty"`
	ReasoningPerMillion   string `json:"reasoning_per_million,omitempty"`
}

// ModelPricing stores exact per-million-token rates as *big.Rat.
type ModelPricing struct {
	InputPerMillion       *big.Rat
	OutputPerMillion      *big.Rat
	CachedInputPerMillion *big.Rat
	CacheWritePerMillion  *big.Rat
	ReasoningPerMillion   *big.Rat
}

// Clone returns a deep copy of ModelPricing with independent *big.Rat values.
func (m ModelPricing) Clone() ModelPricing {
	return ModelPricing{
		InputPerMillion:       cloneRat(m.InputPerMillion),
		OutputPerMillion:      cloneRat(m.OutputPerMillion),
		CachedInputPerMillion: cloneRat(m.CachedInputPerMillion),
		CacheWritePerMillion:  cloneRat(m.CacheWritePerMillion),
		ReasoningPerMillion:   cloneRat(m.ReasoningPerMillion),
	}
}

// ProviderCatalog holds verified pricing for one provider.
type ProviderCatalog struct {
	SchemaVersion string
	Provider      string
	Currency      string
	EffectiveDate string
	BlobSHA256    string
	Models        map[string]ModelPricing
}

// Override replaces one or more rate fields for a (Provider, Model) pair.
type Override struct {
	Provider              string `json:"provider"`
	Model                 string `json:"model"`
	InputPerMillion       string `json:"input_per_million,omitempty"`
	OutputPerMillion      string `json:"output_per_million,omitempty"`
	CachedInputPerMillion string `json:"cached_input_per_million,omitempty"`
	CacheWritePerMillion  string `json:"cache_write_per_million,omitempty"`
	ReasoningPerMillion   string `json:"reasoning_per_million,omitempty"`
}

// Catalog holds verified multi-provider pricing and any deterministic override stamp.
type Catalog struct {
	Providers       map[string]*ProviderCatalog
	CatalogDigest   string
	OverrideVersion string
}

// TokenUsage holds non-negative token counts for cost estimation.
type TokenUsage struct {
	InputTokens       int64
	OutputTokens      int64
	CachedInputTokens int64
	CacheWriteTokens  int64
	ReasoningTokens   int64
}

// CostBreakdown reports exact-rational component costs and total cost.
type CostBreakdown struct {
	Currency        string
	Provider        string
	Model           string
	CatalogDigest   string
	OverrideVersion string
	InputCost       *big.Rat
	OutputCost      *big.Rat
	CachedInputCost *big.Rat
	CacheWriteCost  *big.Rat
	ReasoningCost   *big.Rat
	TotalCost       *big.Rat
}

// ParseDecimalRat parses a non-negative strict decimal string into an exact *big.Rat.
func ParseDecimalRat(s string) (*big.Rat, error) {
	if !strictDecimalRe.MatchString(s) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidDecimal, s)
	}
	r, ok := new(big.Rat).SetString(s)
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrInvalidDecimal, s)
	}
	return r, nil
}

// LoadProviderBlob verifies spec.Data against spec.ExpectedSHA256, decodes JSON
// with DisallowUnknownFields(), rejects trailing tokens, and parses all prices
// via ParseDecimalRat.
func LoadProviderBlob(spec ProviderBlobSpec) (*ProviderCatalog, error) {
	expected := strings.ToLower(strings.TrimSpace(spec.ExpectedSHA256))
	if !sha256HexRe.MatchString(expected) {
		return nil, fmt.Errorf("%w: malformed expected sha256 %q", ErrDigestMismatch, spec.ExpectedSHA256)
	}
	sum := sha256.Sum256(spec.Data)
	actual := hex.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		return nil, fmt.Errorf("%w: got %s want %s", ErrDigestMismatch, actual, expected)
	}

	dec := json.NewDecoder(bytes.NewReader(spec.Data))
	dec.DisallowUnknownFields()

	var raw rawProviderCatalog
	if err := dec.Decode(&raw); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidCatalog, err)
	}
	var trailing any
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%w: trailing JSON data", ErrInvalidCatalog)
	}

	if raw.SchemaVersion != SupportedSchemaVersion {
		return nil, fmt.Errorf("%w: unsupported schema_version %q", ErrInvalidCatalog, raw.SchemaVersion)
	}
	provider := strings.ToLower(strings.TrimSpace(raw.Provider))
	if provider == "" {
		return nil, fmt.Errorf("%w: provider is required", ErrInvalidCatalog)
	}
	if spec.Provider != "" && strings.ToLower(strings.TrimSpace(spec.Provider)) != provider {
		return nil, fmt.Errorf("%w: provider mismatch %q vs %q", ErrInvalidCatalog, spec.Provider, provider)
	}
	currency := strings.ToUpper(strings.TrimSpace(raw.Currency))
	if currency == "" {
		return nil, fmt.Errorf("%w: currency is required", ErrInvalidCatalog)
	}
	if len(raw.Models) == 0 {
		return nil, fmt.Errorf("%w: models map cannot be empty", ErrInvalidCatalog)
	}

	models := make(map[string]ModelPricing, len(raw.Models))
	for modelName, rm := range raw.Models {
		name := strings.TrimSpace(modelName)
		if name == "" {
			return nil, fmt.Errorf("%w: empty model name", ErrInvalidCatalog)
		}
		mp, err := parseRawModelPricing(rm)
		if err != nil {
			return nil, fmt.Errorf("model %q: %w", name, err)
		}
		models[name] = mp
	}

	return &ProviderCatalog{
		SchemaVersion: raw.SchemaVersion,
		Provider:      provider,
		Currency:      currency,
		EffectiveDate: raw.EffectiveDate,
		BlobSHA256:    actual,
		Models:        models,
	}, nil
}

func parseRawModelPricing(rm rawModelPricing) (ModelPricing, error) {
	if rm.InputPerMillion == "" || rm.OutputPerMillion == "" {
		return ModelPricing{}, fmt.Errorf("%w: input_per_million and output_per_million are required", ErrInvalidCatalog)
	}
	in, err := ParseDecimalRat(rm.InputPerMillion)
	if err != nil {
		return ModelPricing{}, err
	}
	out, err := ParseDecimalRat(rm.OutputPerMillion)
	if err != nil {
		return ModelPricing{}, err
	}
	cached, err := parseOptionalDecimal(rm.CachedInputPerMillion)
	if err != nil {
		return ModelPricing{}, err
	}
	cacheWrite, err := parseOptionalDecimal(rm.CacheWritePerMillion)
	if err != nil {
		return ModelPricing{}, err
	}
	reasoning, err := parseOptionalDecimal(rm.ReasoningPerMillion)
	if err != nil {
		return ModelPricing{}, err
	}
	return ModelPricing{
		InputPerMillion:       in,
		OutputPerMillion:      out,
		CachedInputPerMillion: cached,
		CacheWritePerMillion:  cacheWrite,
		ReasoningPerMillion:   reasoning,
	}, nil
}

func parseOptionalDecimal(s string) (*big.Rat, error) {
	if s == "" {
		return big.NewRat(0, 1), nil
	}
	return ParseDecimalRat(s)
}

// LoadCatalog verifies every provider blob in specs, applies any overrides, and
// computes deterministic CatalogDigest and OverrideVersion stamps.
func LoadCatalog(specs []ProviderBlobSpec, overrides []Override) (*Catalog, error) {
	if len(specs) == 0 {
		return nil, fmt.Errorf("%w: at least one provider blob is required", ErrInvalidCatalog)
	}

	providers := make(map[string]*ProviderCatalog, len(specs))
	providerNames := make([]string, 0, len(specs))
	for _, spec := range specs {
		pc, err := LoadProviderBlob(spec)
		if err != nil {
			return nil, err
		}
		if _, dup := providers[pc.Provider]; dup {
			return nil, fmt.Errorf("%w: duplicate provider %q", ErrInvalidCatalog, pc.Provider)
		}
		providers[pc.Provider] = pc
		providerNames = append(providerNames, pc.Provider)
	}
	slices.Sort(providerNames)

	catHash := sha256.New()
	for _, name := range providerNames {
		_, _ = fmt.Fprintf(catHash, "%d:%s\x00%s\x00", len(name), name, providers[name].BlobSHA256)
	}
	catalogDigest := hex.EncodeToString(catHash.Sum(nil))

	var overrideVersion string
	if len(overrides) > 0 {
		stamp, err := applyOverrides(providers, overrides)
		if err != nil {
			return nil, err
		}
		overrideVersion = stamp
	}

	return &Catalog{
		Providers:       providers,
		CatalogDigest:   catalogDigest,
		OverrideVersion: overrideVersion,
	}, nil
}

// ComputeOverrideVersion returns a deterministic cr-override:sha256:<digest>
// version stamp independent of the input slice order.
func ComputeOverrideVersion(overrides []Override) (string, error) {
	if len(overrides) == 0 {
		return "", nil
	}
	normalized, err := normalizeOverrides(overrides)
	if err != nil {
		return "", err
	}
	return hashNormalizedOverrides(normalized), nil
}

func normalizeOverrides(overrides []Override) ([]Override, error) {
	norm := make([]Override, 0, len(overrides))
	seen := make(map[string]bool, len(overrides))

	for _, o := range overrides {
		prov := strings.ToLower(strings.TrimSpace(o.Provider))
		model := strings.TrimSpace(o.Model)
		if prov == "" || model == "" {
			return nil, fmt.Errorf("%w: override requires provider and model", ErrInvalidCatalog)
		}
		key := prov + "\x00" + model
		if seen[key] {
			return nil, fmt.Errorf("%w: duplicate override for %s/%s", ErrInvalidCatalog, prov, model)
		}
		seen[key] = true

		hasField := false
		for _, field := range []string{
			o.InputPerMillion,
			o.OutputPerMillion,
			o.CachedInputPerMillion,
			o.CacheWritePerMillion,
			o.ReasoningPerMillion,
		} {
			if field != "" {
				hasField = true
				if _, err := ParseDecimalRat(field); err != nil {
					return nil, err
				}
			}
		}
		if !hasField {
			return nil, fmt.Errorf("%w: override for %s/%s sets no prices", ErrInvalidCatalog, prov, model)
		}

		norm = append(norm, Override{
			Provider:              prov,
			Model:                 model,
			InputPerMillion:       o.InputPerMillion,
			OutputPerMillion:      o.OutputPerMillion,
			CachedInputPerMillion: o.CachedInputPerMillion,
			CacheWritePerMillion:  o.CacheWritePerMillion,
			ReasoningPerMillion:   o.ReasoningPerMillion,
		})
	}

	slices.SortFunc(norm, func(a, b Override) int {
		if a.Provider != b.Provider {
			return strings.Compare(a.Provider, b.Provider)
		}
		return strings.Compare(a.Model, b.Model)
	})
	return norm, nil
}

func hashNormalizedOverrides(norm []Override) string {
	h := sha256.New()
	for _, o := range norm {
		for _, field := range []string{
			o.Provider,
			o.Model,
			o.InputPerMillion,
			o.OutputPerMillion,
			o.CachedInputPerMillion,
			o.CacheWritePerMillion,
			o.ReasoningPerMillion,
		} {
			_, _ = fmt.Fprintf(h, "%d:%s\x00", len(field), field)
		}
	}
	return OverrideVersionPrefix + hex.EncodeToString(h.Sum(nil))
}

func applyOverrides(providers map[string]*ProviderCatalog, overrides []Override) (string, error) {
	norm, err := normalizeOverrides(overrides)
	if err != nil {
		return "", err
	}

	for _, o := range norm {
		pc, ok := providers[o.Provider]
		if !ok {
			return "", fmt.Errorf("%w: override provider %q not in catalog", ErrModelNotFound, o.Provider)
		}
		mp, ok := pc.Models[o.Model]
		if !ok {
			return "", fmt.Errorf("%w: override model %s/%s not in catalog", ErrModelNotFound, o.Provider, o.Model)
		}
		updated := mp.Clone()
		if o.InputPerMillion != "" {
			updated.InputPerMillion, _ = ParseDecimalRat(o.InputPerMillion)
		}
		if o.OutputPerMillion != "" {
			updated.OutputPerMillion, _ = ParseDecimalRat(o.OutputPerMillion)
		}
		if o.CachedInputPerMillion != "" {
			updated.CachedInputPerMillion, _ = ParseDecimalRat(o.CachedInputPerMillion)
		}
		if o.CacheWritePerMillion != "" {
			updated.CacheWritePerMillion, _ = ParseDecimalRat(o.CacheWritePerMillion)
		}
		if o.ReasoningPerMillion != "" {
			updated.ReasoningPerMillion, _ = ParseDecimalRat(o.ReasoningPerMillion)
		}
		pc.Models[o.Model] = updated
	}

	return hashNormalizedOverrides(norm), nil
}

// Lookup returns a cloned ModelPricing and currency for (provider, model).
func (c *Catalog) Lookup(provider, model string) (ModelPricing, string, bool) {
	prov := strings.ToLower(strings.TrimSpace(provider))
	pc, ok := c.Providers[prov]
	if !ok {
		return ModelPricing{}, "", false
	}
	mp, ok := pc.Models[strings.TrimSpace(model)]
	if !ok {
		return ModelPricing{}, "", false
	}
	return mp.Clone(), pc.Currency, true
}

// EstimateCost computes exact-rational component and total costs for usage.
func (c *Catalog) EstimateCost(provider, model string, usage TokenUsage) (CostBreakdown, error) {
	for _, n := range []int64{
		usage.InputTokens,
		usage.OutputTokens,
		usage.CachedInputTokens,
		usage.CacheWriteTokens,
		usage.ReasoningTokens,
	} {
		if n < 0 {
			return CostBreakdown{}, ErrInvalidUsage
		}
	}

	prov := strings.ToLower(strings.TrimSpace(provider))
	mod := strings.TrimSpace(model)
	mp, currency, ok := c.Lookup(prov, mod)
	if !ok {
		return CostBreakdown{}, fmt.Errorf("%w: %s/%s", ErrModelNotFound, prov, mod)
	}

	inCost := tokenCost(usage.InputTokens, mp.InputPerMillion)
	outCost := tokenCost(usage.OutputTokens, mp.OutputPerMillion)
	cachedCost := tokenCost(usage.CachedInputTokens, mp.CachedInputPerMillion)
	writeCost := tokenCost(usage.CacheWriteTokens, mp.CacheWritePerMillion)
	reasonCost := tokenCost(usage.ReasoningTokens, mp.ReasoningPerMillion)

	total := new(big.Rat)
	for _, part := range []*big.Rat{inCost, outCost, cachedCost, writeCost, reasonCost} {
		total.Add(total, part)
	}

	return CostBreakdown{
		Currency:        currency,
		Provider:        prov,
		Model:           mod,
		CatalogDigest:   c.CatalogDigest,
		OverrideVersion: c.OverrideVersion,
		InputCost:       inCost,
		OutputCost:      outCost,
		CachedInputCost: cachedCost,
		CacheWriteCost:  writeCost,
		ReasoningCost:   reasonCost,
		TotalCost:       total,
	}, nil
}

func tokenCost(tokens int64, ratePerMillion *big.Rat) *big.Rat {
	if tokens == 0 || ratePerMillion == nil || ratePerMillion.Sign() == 0 {
		return big.NewRat(0, 1)
	}
	// (tokens * num) / (1_000_000 * denom)
	num := new(big.Int).Mul(big.NewInt(tokens), ratePerMillion.Num())
	den := new(big.Int).Mul(oneMillion, ratePerMillion.Denom())
	return new(big.Rat).SetFrac(num, den)
}

// FormatDecimalHalfUp formats r to decimals places after the decimal point
// using exact *big.Int arithmetic and round-half-up away from zero.
func FormatDecimalHalfUp(r *big.Rat, decimals int) string {
	return formatDecimal(r, decimals, false)
}

// FormatDecimalHalfEven formats r to decimals places after the decimal point
// using exact *big.Int arithmetic and round-half-to-even.
func FormatDecimalHalfEven(r *big.Rat, decimals int) string {
	return formatDecimal(r, decimals, true)
}

func formatDecimal(r *big.Rat, decimals int, halfEven bool) string {
	if decimals < 0 {
		decimals = 0
	}
	if r == nil {
		r = big.NewRat(0, 1)
	}
	neg := r.Sign() < 0
	absRat := new(big.Rat).Abs(r)

	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	scaledNum := new(big.Int).Mul(absRat.Num(), scale)
	denom := absRat.Denom()

	quot, rem := new(big.Int).QuoRem(scaledNum, denom, new(big.Int))
	twiceRem := new(big.Int).Lsh(rem, 1)
	cmp := twiceRem.Cmp(denom)
	if cmp > 0 || (cmp == 0 && (!halfEven || quot.Bit(0) == 1)) {
		quot.Add(quot, big.NewInt(1))
	}

	if decimals == 0 {
		if neg && quot.Sign() > 0 {
			return "-" + quot.String()
		}
		return quot.String()
	}

	intPart, fracPart := new(big.Int).QuoRem(quot, scale, new(big.Int))
	fracStr := fmt.Sprintf("%0*s", decimals, fracPart.String())
	if neg && quot.Sign() > 0 {
		return "-" + intPart.String() + "." + fracStr
	}
	return intPart.String() + "." + fracStr
}

func cloneRat(r *big.Rat) *big.Rat {
	if r == nil {
		return big.NewRat(0, 1)
	}
	return new(big.Rat).Set(r)
}
