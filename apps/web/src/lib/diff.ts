/**
 * A unified diff (the output of `diff -u` or `git diff`) read into files, hunks and numbered lines.
 * Only what the text says is read: nothing is applied or checked against a file. Text that holds no
 * hunk is not a diff, and `parseUnifiedDiff` returns null so the caller shows it as plain text.
 */

export type DiffLineKind = "add" | "del" | "ctx" | "note";

export interface DiffLine {
  kind: DiffLineKind;
  /** Line number in the old file; absent for added lines and notes. */
  oldNo?: number;
  /** Line number in the new file; absent for removed lines and notes. */
  newNo?: number;
  /** The line without its leading sign. */
  text: string;
}

export interface DiffHunk {
  /** The `@@ -a,b +c,d @@ section` line as written. */
  header: string;
  /** The text after the closing `@@`, often a function name. */
  section: string;
  lines: DiffLine[];
}

export interface DiffFile {
  /** Path from the `+++` line, else the `---` line, else the `diff --git` line; "" when none was given. */
  path: string;
  oldPath: string;
  /** Header lines before the first hunk (`diff --git`, `index`, `new file mode`, and so on). */
  meta: string[];
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  added: number;
  removed: number;
  lines: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** `a/dir/f.ts` and `b/dir/f.ts` read as `dir/f.ts`; a path may end in a tab and a timestamp. */
function cleanPath(raw: string): string {
  let p = raw.split("\t")[0]!.trim();
  if (p.startsWith('"') && p.endsWith('"') && p.length > 1) p = p.slice(1, -1);
  if (p === "/dev/null") return p;
  return p.replace(/^[ab]\//, "");
}

function pathFromGitHeader(line: string): string {
  const m = /^diff --git (?:"?a\/)?(.+?)"? (?:"?b\/)?(.+?)"?$/.exec(line);
  return m ? m[2]! : "";
}

export function parseUnifiedDiff(input: string): ParsedDiff | null {
  const rows = input.replace(/\r\n?/g, "\n").split("\n");
  if (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldNo = 0;
  let newNo = 0;
  // Lines still owed to the open hunk by its header counts; a hunk ends when both reach zero.
  let oldLeft = 0;
  let newLeft = 0;
  let pendingOld = "";
  const open = (): DiffFile => {
    if (!file) {
      file = { path: "", oldPath: "", meta: [], hunks: [], added: 0, removed: 0 };
      files.push(file);
    }
    return file;
  };

  for (const row of rows) {
    // "\\ No newline at end of file" follows the last line of a hunk, after its counts are spent.
    if (row[0] === "\\" && hunk) {
      hunk.lines.push({ kind: "note", text: row.replace(/^\\ ?/, "") });
      continue;
    }
    const inHunk = hunk !== undefined && (oldLeft > 0 || newLeft > 0);
    if (inHunk && hunk) {
      const c = row[0];
      if (c === "+" && newLeft > 0) {
        hunk.lines.push({ kind: "add", newNo: newNo++, text: row.slice(1) });
        newLeft--;
        file!.added++;
        continue;
      }
      if (c === "-" && oldLeft > 0) {
        hunk.lines.push({ kind: "del", oldNo: oldNo++, text: row.slice(1) });
        oldLeft--;
        file!.removed++;
        continue;
      }
      if ((c === " " || row === "") && oldLeft > 0 && newLeft > 0) {
        hunk.lines.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: row.slice(1) });
        oldLeft--;
        newLeft--;
        continue;
      }
      // Anything else ends the hunk early (a truncated or hand-edited patch); read it as a header.
      oldLeft = 0;
      newLeft = 0;
    }
    if (row.startsWith("diff --git ")) {
      file = { path: pathFromGitHeader(row), oldPath: "", meta: [row], hunks: [], added: 0, removed: 0 };
      files.push(file);
      hunk = undefined;
      pendingOld = "";
      continue;
    }
    if (row.startsWith("--- ")) {
      // A `---` after a finished hunk starts the next file of a plain `diff -u`.
      if (file && file.hunks.length > 0) file = undefined;
      pendingOld = cleanPath(row.slice(4));
      const f = open();
      f.oldPath = pendingOld;
      if (f.path === "") f.path = pendingOld;
      hunk = undefined;
      continue;
    }
    if (row.startsWith("+++ ") && file && file.hunks.length === 0) {
      const p = cleanPath(row.slice(4));
      file.path = p === "/dev/null" ? file.oldPath || file.path : p;
      continue;
    }
    const m = HUNK.exec(row);
    if (m) {
      const f = open();
      oldNo = Number(m[1]);
      newNo = Number(m[3]);
      oldLeft = m[2] === undefined ? 1 : Number(m[2]);
      newLeft = m[4] === undefined ? 1 : Number(m[4]);
      hunk = { header: row, section: m[5] ?? "", lines: [] };
      f.hunks.push(hunk);
      continue;
    }
    // Header and trailing lines: kept with the file so nothing the patch says is dropped.
    if (file && file.hunks.length === 0) file.meta.push(row);
  }

  // A file with no text hunk (binary, pure rename, mode change) is still part of the patch: keep it, shown by its
  // header lines, so the preview never looks complete while hiding a change. Nothing parsed as text: no preview.
  if (!files.some((f) => f.hunks.length > 0)) return null;
  const real = files.filter((f) => f.hunks.length > 0 || f.meta.length > 0);
  const added = real.reduce((n, f) => n + f.added, 0);
  const removed = real.reduce((n, f) => n + f.removed, 0);
  const lines = real.reduce((n, f) => n + f.hunks.reduce((k, h) => k + h.lines.length, 0), 0);
  return { files: real, added, removed, lines };
}

/** True for the file names a person calls a diff. */
export function isDiffName(name: string): boolean {
  return /\.(diff|patch)$/i.test(name);
}
