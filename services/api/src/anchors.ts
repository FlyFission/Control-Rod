/**
 * Deterministic anchor check (pattern PL3 in docs/patterns/plannotator.md; review panel design
 * section 6.3, Stage 1). Confirms that a note or a finding points at text that is really there
 * before anyone reads it. Pure: the caller supplies the snapshot; nothing here reads files, the
 * clock or the network. Types follow spec/anchors.tsp.
 */

export type AnchorPath = string;

export type Anchor =
  | { kind: "head-lines"; path: AnchorPath; start: number; end: number }
  | { kind: "base-lines"; path: AnchorPath; start: number; end: number }
  | { kind: "deleted-file"; path: AnchorPath }
  | { kind: "section"; path: AnchorPath; side: "head" | "base"; heading_path: string[] };

export interface AnchoredQuote {
  anchor: Anchor;
  quote?: string;
}

export type AnchorFailure =
  | "bad-path"
  | "bad-range"
  | "missing-quote"
  | "not-a-diff"
  | "path-missing"
  | "out-of-range"
  | "quote-not-found"
  | "not-in-change"
  | "not-deleted"
  | "section-missing"
  | "section-ambiguous";

export interface AnchorCheck {
  anchored: boolean;
  failure?: AnchorFailure;
  outside_change?: boolean;
}

/** One hunk of a unified diff, with the exact old and new line numbers it removed and added. */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  removed: number[];
  added: number[];
}

/** One file of a unified diff. A null path is /dev/null: an added or a deleted file. */
export interface DiffFile {
  oldPath: string | null;
  newPath: string | null;
  hunks: Hunk[];
}

/** What the check may read: the head snapshot, and for a diff target the base tree and the diff. */
export interface Snapshot {
  head(path: string): string | undefined;
  base?: (path: string) => string | undefined;
  diff?: DiffFile[];
}

/**
 * The rule of AnchorPath in spec/anchors.tsp, and also no line breaks: with one, the
 * look-aheads in the contract's pattern stop at the break and miss a later `..` segment.
 */
const PATH = /^(?!\/)(?![\s\S]*\\)(?!([\s\S]*\/)?\.{1,2}(\/|$))[^\u0000\r\n]{1,1024}$/u;

export function validPath(path: string): boolean {
  return PATH.test(path);
}

const fail = (failure: AnchorFailure): AnchorCheck => ({ anchored: false, failure });

/** Lines of a file, 1-based by index + 1. A final newline does not start another line. */
export function lines(text: string): string[] {
  const out = text.split("\n");
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

/** Collapses every run of whitespace to one space and trims, so line wrapping and indentation do not matter. */
export function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function quoteIn(quote: string, text: string): boolean {
  const q = normalize(quote);
  return q.length > 0 && normalize(text).includes(q);
}

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Decodes a C-quoted path, as git writes names with non-ASCII or special characters ("caf\303\251.txt"). */
function unquoteC(quoted: string): string {
  const bytes: number[] = [];
  const body = quoted.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c !== "\\") {
      bytes.push(...new TextEncoder().encode(c));
      continue;
    }
    const octal = /^[0-7]{3}/u.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      i += 3;
    } else {
      const next = body[i + 1] ?? "";
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const diffPath = (raw: string): string | null => {
  // Git ends a header path that contains a space with a tab; spaces inside the name are kept.
  let p = raw;
  if (p.startsWith('"')) {
    const end = /^"(?:[^"\\]|\\.)*"/u.exec(p);
    p = end ? unquoteC(end[0]) : p;
  } else {
    const tab = p.indexOf("\t");
    if (tab >= 0) p = p.slice(0, tab);
  }
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//u, "");
};

/**
 * The path in a `diff --git a/P b/P` header when both sides name the same file, which is the
 * case for an added or deleted file. Returns null when the two sides cannot be told apart.
 */
function gitHeaderPath(rest: string): string | null {
  if (rest.startsWith('"')) {
    const m = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/u.exec(rest);
    if (!m) return null;
    const a = diffPath(m[1]!);
    return a !== null && a === diffPath(m[2]!) ? a : null;
  }
  if ((rest.length - 5) % 2 !== 0) return null;
  const p = rest.slice(2, 2 + (rest.length - 5) / 2);
  return rest === `a/${p} b/${p}` ? p : null;
}

/** Parses a unified diff (git format). Unknown lines outside hunks are ignored. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: Hunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  // A file added or deleted empty has a `diff --git` header and a mode line but no `---`/`+++`.
  let header: { path: string | null; mode: "deleted" | "new" | undefined; seen: boolean } | undefined;
  const flushHeader = () => {
    if (header && !header.seen && header.mode && header.path !== null) {
      files.push({
        oldPath: header.mode === "deleted" ? header.path : null,
        newPath: header.mode === "new" ? header.path : null,
        hunks: [],
      });
    }
    header = undefined;
  };
  for (const line of lines(text)) {
    if (line.startsWith("diff --git ")) {
      flushHeader();
      header = { path: gitHeaderPath(line.slice(11)), mode: undefined, seen: false };
      file = undefined;
      hunk = undefined;
      continue;
    }
    if (header && !hunk && line.startsWith("deleted file mode ")) header.mode = "deleted";
    if (header && !hunk && line.startsWith("new file mode ")) header.mode = "new";
    if (line.startsWith("--- ") && !hunk) {
      if (header) header.seen = true;
      file = { oldPath: diffPath(line.slice(4)), newPath: null, hunks: [] };
      files.push(file);
      continue;
    }
    if (line.startsWith("+++ ") && file && !hunk) {
      file.newPath = diffPath(line.slice(4));
      continue;
    }
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (h && file) {
      hunk = {
        oldStart: Number(h[1]),
        oldLines: h[2] === undefined ? 1 : Number(h[2]),
        newStart: Number(h[3]),
        newLines: h[4] === undefined ? 1 : Number(h[4]),
        removed: [],
        added: [],
      };
      file.hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("-")) hunk.removed.push(oldLine++);
    else if (line.startsWith("+")) hunk.added.push(newLine++);
    else if (line.startsWith(" ") || line === "") {
      oldLine++;
      newLine++;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
    } else {
      hunk = undefined;
    }
  }
  flushHeader();
  return files;
}

const overlaps = (a: number, b: number, c: number, d: number) => a <= d && c <= b;

/** True when head lines start..end touch a hunk of the change: an added line, or the place of a deletion. */
function touchesChange(file: DiffFile, start: number, end: number): boolean {
  return file.hunks.some(
    (h) =>
      h.added.some((n) => n >= start && n <= end) ||
      (h.removed.length > 0 && overlaps(start, end, h.newStart, h.newStart + Math.max(h.newLines, 1) - 1)),
  );
}

interface Heading {
  level: number;
  title: string;
  line: number;
}

/** ATX headings (`#` to `######`) outside fenced code blocks. */
export function headings(doc: string): Heading[] {
  const out: Heading[] = [];
  // The open fence's character and length. Only a fence of the same character, at least as
  // long and with nothing after it but spaces, closes it (CommonMark 4.5).
  let fence: { char: string; length: number } | undefined;
  lines(doc).forEach((text, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(text);
    if (f) {
      const run = f[1]!;
      if (!fence) {
        fence = { char: run[0]!, length: run.length };
        return;
      }
      if (run[0] === fence.char && run.length >= fence.length && f[2]!.trim() === "") {
        fence = undefined;
        return;
      }
    }
    if (fence) return;
    const h = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/u.exec(text);
    if (h) out.push({ level: h[1]!.length, title: (h[2] ?? "").replace(/[ \t]+#+$/u, "").trim(), line: i + 1 });
  });
  return out;
}

/**
 * Finds the sections whose chain of enclosing headings ends with headingPath, and returns
 * each one's text: its heading line up to the next heading at the same or a higher level.
 */
export function sections(doc: string, headingPath: string[]): string[] {
  const all = headings(doc);
  const docLines = lines(doc);
  const want = headingPath.map((t) => t.trim());
  const found: string[] = [];
  const stack: Heading[] = [];
  all.forEach((h, i) => {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) stack.pop();
    stack.push(h);
    const chain = stack.map((s) => s.title);
    const tail = chain.slice(chain.length - want.length);
    if (tail.length === want.length && tail.every((t, k) => t === want[k])) {
      const next = all.slice(i + 1).find((n) => n.level <= h.level);
      found.push(docLines.slice(h.line - 1, next ? next.line - 1 : docLines.length).join("\n"));
    }
  });
  return found;
}

function checkLines(text: string | undefined, start: number, end: number, quote: string | undefined): AnchorCheck | undefined {
  if (text === undefined) return fail("path-missing");
  const all = lines(text);
  if (end > all.length) return fail("out-of-range");
  if (quote === undefined || normalize(quote) === "") return fail("missing-quote");
  if (!quoteIn(quote, all.slice(start - 1, end).join("\n"))) return fail("quote-not-found");
  return undefined;
}

/** Checks one anchored quote against a snapshot. Never throws for bad input; it fails closed. */
export function checkAnchor(q: AnchoredQuote, s: Snapshot): AnchorCheck {
  const a = q.anchor;
  if (!validPath(a.path)) return fail("bad-path");
  const fileIn = (side: "old" | "new") =>
    s.diff?.find((f) => (side === "old" ? f.oldPath : f.newPath) === a.path);

  switch (a.kind) {
    case "head-lines": {
      if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 1 || a.end < a.start) return fail("bad-range");
      const bad = checkLines(s.head(a.path), a.start, a.end, q.quote);
      if (bad) return bad;
      if (!s.diff) return { anchored: true };
      const file = fileIn("new");
      return { anchored: true, outside_change: !(file && touchesChange(file, a.start, a.end)) };
    }
    case "base-lines": {
      if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 1 || a.end < a.start) return fail("bad-range");
      if (!s.diff || !s.base) return fail("not-a-diff");
      const bad = checkLines(s.base(a.path), a.start, a.end, q.quote);
      if (bad) return bad;
      const file = fileIn("old");
      const removed = file?.hunks.some((h) => h.removed.some((n) => n >= a.start && n <= a.end)) ?? false;
      return removed ? { anchored: true } : fail("not-in-change");
    }
    case "deleted-file": {
      if (!s.diff || !s.base) return fail("not-a-diff");
      const before = s.base(a.path);
      if (before === undefined) return fail("path-missing");
      const file = fileIn("old");
      if (!file || file.newPath !== null || s.head(a.path) !== undefined) return fail("not-deleted");
      if (q.quote !== undefined && !quoteIn(q.quote, before)) return fail("quote-not-found");
      return { anchored: true };
    }
    case "section": {
      if (a.heading_path.length === 0) return fail("section-missing");
      if (a.side === "base" && (!s.diff || !s.base)) return fail("not-a-diff");
      const doc = a.side === "head" ? s.head(a.path) : s.base!(a.path);
      if (doc === undefined) return fail("path-missing");
      const found = sections(doc, a.heading_path);
      if (found.length === 0) return fail("section-missing");
      if (found.length > 1) return fail("section-ambiguous");
      if (a.side === "base") {
        const now = s.head(a.path);
        const changed = s.diff!.some((f) => f.oldPath === a.path);
        if (!changed || (now !== undefined && sections(now, a.heading_path).length > 0)) return fail("not-in-change");
      }
      if (q.quote !== undefined && !quoteIn(q.quote, found[0]!)) return fail("quote-not-found");
      return { anchored: true };
    }
    default:
      return fail("bad-path");
  }
}
