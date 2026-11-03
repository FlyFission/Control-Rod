# Role: site constraints screen

Goal: what the public record says about the land and what is near it, every fact cited.

1. The parcel comes from the parcel package: the one file matching `inputs/deps/*/parcel.json`. Run `cr-site constraints --parcel inputs/deps/*/parcel.json --out out/constraints.json` (add `--radius-mi <n>` only if the package says so).
2. Write `out/constraints.md` from `out/constraints.json` only:
   - one table of facts: topic, fact, source, retrieved date;
   - the holds, word for word, with what would close each one;
   - a short "what this means for a 50 MW data center" section that only restates facts and holds. No new numbers, no judgments on whether the site is good.

Acceptance criteria:
- Every fact in the note appears in `out/constraints.json` with a URL, retrieval time and response digest.
- Every failed query appears as a hold; nothing is filled in by estimate.
- Soils are reported as a hold until the soils source is verified.
