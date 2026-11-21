import "@typespec/json-schema";
import "./records.tsp";

using JsonSchema;

/**
 * Anchors: where in a reviewed subject a note or a finding points, in a form a deterministic
 * check can confirm before anyone reads it (pattern PL3 in docs/patterns/plannotator.md;
 * review panel design section 6.3, Stage 1). One schema serves a person's review note and a
 * model reviewer's finding. Additive types.
 *
 * Paths are repository-relative with forward slashes: no leading slash, no backslash, no `.`
 * or `..` segment. Lines are 1-based and inclusive. Head is the reviewed snapshot; base is
 * the tree it is compared with (diff targets only).
 */
@jsonSchema
@id("https://controlrod.dev/schemas/v0")
namespace ControlRod.Records;

/** A repository-relative path that cannot leave the snapshot. */
@pattern("^(?!/)(?!.*\\\\)(?!(.*/)?\\.{1,2}(/|$))[^\\u0000]{1,1024}$")
scalar AnchorPath extends string;

/** Lines in the head snapshot. On a diff target the check also says whether they touch the change. */
@extension("unevaluatedProperties", false)
model HeadLinesAnchor {
  kind: "head-lines";
  path: AnchorPath;
  @minValue(1) start: int32;
  @minValue(1) end: int32;
}

/** Lines in the base tree that the change removed or changed. Diff targets only. */
@extension("unevaluatedProperties", false)
model BaseLinesAnchor {
  kind: "base-lines";
  path: AnchorPath;
  @minValue(1) start: int32;
  @minValue(1) end: int32;
}

/** A file the change deleted. Diff targets only. */
@extension("unevaluatedProperties", false)
model DeletedFileAnchor {
  kind: "deleted-file";
  path: AnchorPath;
}

/**
 * A section of a Markdown document, named by its heading path from the outermost heading in.
 * Side `base` is for a section the change removed.
 */
@extension("unevaluatedProperties", false)
model SectionAnchor {
  kind: "section";
  path: AnchorPath;
  side: "head" | "base";
  @minItems(1) @maxItems(16) heading_path: string[];
}

union Anchor { HeadLinesAnchor, BaseLinesAnchor, DeletedFileAnchor, SectionAnchor }

/** An anchor and the exact text the author says is there. Line anchors need a quote; for a deleted file or a section it is optional. */
@extension("unevaluatedProperties", false)
model AnchoredQuote {
  anchor: Anchor;
  @maxLength(4000) quote?: string;
}

/** Why an anchor could not be confirmed. */
enum AnchorFailure {
  bad_path: "bad-path",
  bad_range: "bad-range",
  missing_quote: "missing-quote",
  not_a_diff: "not-a-diff",
  path_missing: "path-missing",
  out_of_range: "out-of-range",
  quote_not_found: "quote-not-found",
  not_in_change: "not-in-change",
  not_deleted: "not-deleted",
  section_missing: "section-missing",
  section_ambiguous: "section-ambiguous",
}

/** The result of the deterministic check. An unanchored note is never shown as a finding. */
@extension("unevaluatedProperties", false)
model AnchorCheck {
  anchored: boolean;
  failure?: AnchorFailure;
  /** Head lines on a diff target that touch no changed hunk: shown as outside the change, not dropped. */
  outside_change?: boolean;
}
