# Provenance: Nuclear-grade token counter and pack

Source: `FlyFission/nuclear-grade-context-engineering` at `395aa6ed161b773f1cf24abbf85e1c9ff95b969c`, license MIT (retained under `third_party/licenses/FlyFission__nuclear-grade-context-engineering/`), read on 2026-11-21 from a local read-only checkout.

| Local path | Upstream path (last commit touching it) | Removed | Renamed or changed | Tests carried |
| --- | --- | --- | --- | --- |
| `scripts/lib/token-count.mjs` | `nuclear_grade/tokens.py` (`395aa6e`, the pinned commit; the last commit touching the file was not read) | Everything except `count_tokens` and its constants: `tiktoken_count`, `_read_text`, `split_frontmatter`, `FileTokens`, `measure_file`, the file iterators, the redundancy index, `phrase_frequency`, `Report`, `build_report`, `cost_per_signal`, `DEFAULT_BUDGETS`, `load_budgets`, `check_budgets`. | `count_tokens` became `countTokens(text)`. The segment pattern is rewritten with Unicode properties because JavaScript's `\w`, `\d` and `\s` differ from Python's; the characters-per-token factors (4 letters, 3 digits, 2 symbols) and the ceiling division are unchanged. `str.isdigit()` is reproduced as `\p{Nd}` plus a table of No ranges printed by Python's `unicodedata`. | Ported tests: none. New: `scripts/test/token-count.test.mjs` compares sample strings with counts recorded from NGCE's own function (`scripts/test/record-token-counts.mjs`, fixture `scripts/test/fixtures/token-counts.json`), reruns Python live when the checkout is present, and with `NGCE_EXHAUSTIVE=1` compares every code point Python's Unicode database assigns. |

The pack files under `packs/nuclear-grade/` are byte-identical copies or cards compiled from them; they are listed with digests in `packs/nuclear-grade/manifest.json` and `third_party/licenses/FlyFission__nuclear-grade-context-engineering/INVENTORY.txt`, not here.

## Not carried

The rest of `tokens.py` (budgets, audit report, redundancy index): Control Rod needs only the count. The optional `tiktoken` cross-check: it needs a third-party package. Skill `assets/` and `references/` folders next to the included `SKILL.md` files: the pack copies `SKILL.md` only.

## Unavoidable behaviour differences

1. **Code points Python's Unicode database does not assign.** Node 22 uses a newer Unicode version than Python 3.13 (15.1.0), so a code point assigned only in the newer version is classed as a letter or digit in JavaScript and as a symbol in Python. The exhaustive test skips those code points; on assigned ones the two agree. A caller counting text with such characters may differ from NGCE by a few tokens.

## Required links

[Risk](risk.md), [verification](verification.md). Provenance rule: [`docs/third-party/port-provenance.md`](../../../docs/third-party/port-provenance.md).

## Exit criteria

Every function the port carries, changes or leaves out is named, and each behaviour difference says whether a test pins it.

## Source-lineage note

Provenance outline from [`docs/third-party/port-provenance.md`](../../../docs/third-party/port-provenance.md); ported source: https://github.com/FlyFission/nuclear-grade-context-engineering at the commit above. No compliance claim is made.
