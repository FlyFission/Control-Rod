import { useMemo, useState } from "react";
import { type DiffLine, type ParsedDiff, parseUnifiedDiff } from "../lib/diff.js";

/** Lines drawn before "Show all": a long patch must not stall the drawer. */
export const DIFF_LINE_CAP = 1500;

const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", ctx: "", note: "\\" };
const SIGN_WORD: Record<DiffLine["kind"], string> = { add: "Added", del: "Removed", ctx: "Unchanged", note: "Note" };

/**
 * A unified diff drawn for reading: old and new line numbers, a sign column and a tint. An added
 * line carries "+" on a lit tint; a removed line carries a minus sign on a hatched tint; neither
 * depends on colour alone. Text that is not a diff is drawn as plain text.
 */
export function DiffView({ text, parsed }: { text: string; parsed?: ParsedDiff | null }) {
  const diff = useMemo(() => (parsed !== undefined ? parsed : parseUnifiedDiff(text)), [text, parsed]);
  const [all, setAll] = useState(false);
  if (diff === null) return <pre className="preview-text">{text}</pre>;
  let budget = all ? Infinity : DIFF_LINE_CAP;
  const hidden = Math.max(0, diff.lines - DIFF_LINE_CAP);
  return (
    <div className="diff" data-testid="diff-view">
      <p className="diff-summary mono small" aria-label={`${diff.files.length} files, ${diff.added} lines added, ${diff.removed} lines removed`}>
        <span>{diff.files.length} {diff.files.length === 1 ? "file" : "files"}</span>
        <span className="diff-count-add">+{diff.added}</span>
        <span className="diff-count-del">{"−"}{diff.removed}</span>
      </p>
      {diff.files.map((f, fi) => {
        if (budget <= 0) return null;
        return (
          <section key={fi} className="diff-file" aria-label={f.path || `File ${fi + 1}`}>
            <h4 className="diff-file-head mono">
              {f.path || "(unnamed file)"}
              <span className="diff-file-count">
                <span className="diff-count-add">+{f.added}</span> <span className="diff-count-del">{"−"}{f.removed}</span>
              </span>
            </h4>
            {f.hunks.map((h, hi) => {
              if (budget <= 0) return null;
              const shown = h.lines.slice(0, budget);
              budget -= shown.length;
              return (
                <table key={hi} className="diff-table">
                  <caption className="sr-only">{h.header}</caption>
                  <colgroup>
                    <col className="diff-col-no" />
                    <col className="diff-col-no" />
                    <col className="diff-col-sign" />
                    <col />
                  </colgroup>
                  <tbody>
                    <tr className="diff-hunk">
                      <td colSpan={4} className="mono">{h.header}</td>
                    </tr>
                    {shown.map((l, li) => (
                      <tr key={li} className={`diff-line diff-${l.kind}`} data-kind={l.kind}>
                        <td className="diff-no mono" aria-hidden="true">{l.oldNo ?? ""}</td>
                        <td className="diff-no mono" aria-hidden="true">{l.newNo ?? ""}</td>
                        <td className="diff-sign mono">
                          <span aria-hidden="true">{SIGN[l.kind]}</span>
                          <span className="sr-only">{SIGN_WORD[l.kind]} line {l.newNo ?? l.oldNo ?? ""}: </span>
                        </td>
                        <td className="diff-code mono">{l.text === "" ? "​" : l.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
          </section>
        );
      })}
      {!all && hidden > 0 && (
        <button type="button" className="btn small diff-more" onClick={() => setAll(true)}>
          Show all ({hidden} more lines)
        </button>
      )}
    </div>
  );
}
