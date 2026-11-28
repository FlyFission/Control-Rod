/**
 * Which repository files an author's outputs change. On a checkout card the change is the author's
 * patch (publishAccepted builds the pull request from it and nothing else), so the files that matter
 * are the ones the patch touches, not the output names: those are changes.patch and RESPONSE.md on
 * every round. Pure, so figures.ts and work.ts share it without importing each other.
 */

/** The patch name the author is asked for (runner checkoutPrompt). */
export const CHANGE_PATCH = "changes.patch";

/**
 * Which of an author's patch outputs make up the change to the repository. Agents often write more
 * than one: a copy under a work folder, or the fix and its tests as two files. A patch at the top of
 * the output wins over ones in folders; among top-level patches, one named changes.patch wins;
 * otherwise patches that touch disjoint files are the change together, in name order. Patches that
 * touch the same file are refused, since applying both could double a change.
 */
export function changePatches<T extends { name: string }>(outputs: T[], filesOf: (o: T) => string[]): { use: T[] } | { refused: string } {
  const all = outputs.filter((o) => /\.(patch|diff)$/i.test(o.name));
  if (all.length <= 1) return { use: all };
  const top = all.filter((o) => !o.name.includes("/"));
  const pool = top.length ? top : all;
  if (pool.length === 1) return { use: pool };
  const named = pool.find((o) => o.name.toLowerCase() === CHANGE_PATCH);
  if (named) return { use: [named] };
  const seen = new Map<string, string>();
  for (const o of pool) {
    for (const f of filesOf(o)) {
      const other = seen.get(f);
      if (other !== undefined && other !== o.name) {
        return { refused: `The accepted work has ${pool.length} patch files, and ${other} and ${o.name} both change ${f}, so Control Rod cannot tell which is the change to open a pull request for.` };
      }
      seen.set(f, o.name);
    }
  }
  return { use: [...pool].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) };
}

/**
 * A path as Git writes it in a header: plain, or in double quotes with C escapes when it has
 * non-ASCII bytes, tabs, quotes or backslashes (octal escapes are UTF-8 bytes).
 */
function gitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw;
  const bytes: number[] = [];
  const body = raw.slice(1, -1);
  const named: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c !== "\\") { bytes.push(...Buffer.from(c, "utf8")); continue; }
    const oct = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 3; continue; }
    const n = named[body[i + 1] ?? ""];
    if (n !== undefined) { bytes.push(n); i += 1; continue; }
    bytes.push(92);
  }
  return Buffer.from(bytes).toString("utf8");
}

const QUOTED = '"(?:[^"\\\\]|\\\\.)*"';
const GIT_HEADER = new RegExp(`^diff --git (${QUOTED}|a/\\S*?) (${QUOTED}|b/.+)$`);
const FILE_HEADER = new RegExp(`^(?:\\+\\+\\+|---) (${QUOTED}|[ab]/.+?)(?:\\t.*)?$`);
const strip = (p: string): string => p.replace(/^[ab]\//, "");

/**
 * For each line of a patch, whether it is hunk payload. A hunk header says how many old and new
 * lines follow, so a removed line reading `-- a/x` or an added one reading `++ b/x` is never taken
 * for a file header.
 */
function inHunk(lines: string[]): boolean[] {
  const payload = lines.map(() => false);
  let oldLeft = 0;
  let newLeft = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (oldLeft > 0 || newLeft > 0) {
      payload[i] = true;
      if (line.startsWith("\\")) continue;
      if (line.startsWith("-")) oldLeft--;
      else if (line.startsWith("+")) newLeft--;
      else { oldLeft--; newLeft--; }
      continue;
    }
    const h = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (h) { oldLeft = h[1] === undefined ? 1 : Number(h[1]); newLeft = h[2] === undefined ? 1 : Number(h[2]); }
    else if (line.startsWith("\\")) payload[i] = true;
  }
  return payload;
}

/** The files a unified diff touches, in order, from its `diff --git` and `+++`/`---` headers. */
export function patchFiles(patch: string): string[] {
  const seen = new Set<string>();
  const lines = patch.split(/\r?\n/);
  const payload = inHunk(lines);
  for (let i = 0; i < lines.length; i++) {
    if (payload[i]) continue;
    const line = lines[i]!;
    const plain = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    const git = plain && !plain[1]!.startsWith('"') && !plain[2]!.startsWith('"') ? [plain[1]!, plain[2]!] : (() => {
      const q = GIT_HEADER.exec(line);
      return q ? [strip(gitPath(q[1]!)), strip(gitPath(q[2]!))] : null;
    })();
    if (git) { seen.add(git[1]!); if (git[0] !== git[1]) seen.add(git[0]!); continue; }
    const hdr = FILE_HEADER.exec(line);
    if (hdr) {
      const path = gitPath(hdr[1]!);
      if (/^[ab]\//.test(path)) seen.add(strip(path));
    }
  }
  return [...seen];
}

const PATCH_NAME = /\.(patch|diff)$/i;

type Output = { name: string; sha256?: string; bytes?: Buffer | null };

/** The patches that make up the change, or every patch when changePatches refuses to choose. */
function chosenPatches<T extends Output>(outputs: T[]): T[] {
  const withText = outputs.filter((o) => PATCH_NAME.test(o.name) && o.bytes);
  const picked = changePatches(withText, (o) => patchFiles(o.bytes!.toString("utf8")));
  return "use" in picked ? picked.use : withText;
}

/**
 * The repository paths a set of outputs touches: the files in its change patch when it has one,
 * otherwise the output names (a card whose deliverables are the files themselves).
 */
export function touchedFiles(outputs: Output[]): string[] {
  const patches = chosenPatches(outputs);
  if (!patches.length) return outputs.map((o) => o.name);
  return [...new Set(patches.flatMap((p) => patchFiles(p.bytes!.toString("utf8"))))];
}

/**
 * A patch split per file: each file's text is every section of the patch that touches it. A section
 * starts at a `diff --git` line, or at a `---`/`+++` pair that is not the header of the git section
 * before it (a plain unified diff).
 */
export function patchSections(patch: string): Map<string, string> {
  const lines = patch.split(/\r?\n/);
  const starts: number[] = [];
  const payload = inHunk(lines);
  for (let i = 0; i < lines.length; i++) {
    if (payload[i]) continue;
    const line = lines[i]!;
    if (line.startsWith("diff --git ")) { starts.push(i); continue; }
    if (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")) {
      const last = starts[starts.length - 1];
      const ownHeader = last !== undefined && lines[last]!.startsWith("diff --git ") && !lines.slice(last + 1, i).some((l) => l.startsWith("@@"));
      if (!ownHeader) starts.push(i);
    }
  }
  const out = new Map<string, string>();
  starts.forEach((s, k) => {
    // Trailing empty lines differ only by where a section falls in the patch; drop them. A hunk line
    // is never empty (context lines start with a space), so whitespace inside hunks is kept.
    const section = lines.slice(s, starts[k + 1] ?? lines.length);
    while (section.length && section[section.length - 1] === "") section.pop();
    const text = section.join("\n");
    for (const f of patchFiles(text)) out.set(f, (out.get(f) ?? "") + text + "\n");
  });
  return out;
}

/** Each touched file with what the change does to it: its patch text, or the output's digest. */
function changeByFile(outputs: Output[]): Map<string, string> {
  const patches = chosenPatches(outputs);
  if (!patches.length) return new Map(outputs.map((o) => [o.name, o.sha256 ?? ""]));
  const out = new Map<string, string>();
  for (const p of patches) for (const [f, text] of patchSections(p.bytes!.toString("utf8"))) out.set(f, (out.get(f) ?? "") + text);
  return out;
}

/**
 * Repository paths whose change differs between two author rounds, including files one round
 * touches and the other does not. Sorted. On a checkout card this compares what each round's patch
 * does to each file; otherwise it compares output digests by name.
 */
export function changedRepoFiles(before: Output[], after: Output[]): string[] {
  const a = changeByFile(before);
  const b = changeByFile(after);
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names].filter((n) => a.get(n) !== b.get(n)).sort();
}
