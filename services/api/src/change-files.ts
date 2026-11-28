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

/** The files a unified diff touches, in order, from its `diff --git` and `+++`/`---` headers. */
export function patchFiles(patch: string): string[] {
  const seen = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (git) { seen.add(git[2]!); if (git[1] !== git[2]) seen.add(git[1]!); continue; }
    const hdr = /^(?:\+\+\+|---) [ab]\/(.+?)(?:\t.*)?$/.exec(line);
    if (hdr) seen.add(hdr[1]!);
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
  for (let i = 0; i < lines.length; i++) {
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
    // Trailing blank lines differ only by where a section falls in the patch; drop them.
    const text = lines.slice(s, starts[k + 1] ?? lines.length).join("\n").replace(/\s+$/, "");
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
