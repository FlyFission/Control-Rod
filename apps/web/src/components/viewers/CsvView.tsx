import { useMemo } from "react";
import Papa from "papaparse";

export const MAX_ROWS = 1000;
const NUMBER = /^[-+]?[$€£]?\d[\d,]*(\.\d+)?%?$/;

/** A CSV or TSV file as a table, first row as the header, parsed by Papa Parse (MIT). */
export function CsvView({ text, name }: { text: string; name: string }) {
  const parsed = useMemo(() => {
    const out = Papa.parse<string[]>(text.trim(), { delimiter: name.toLowerCase().endsWith(".tsv") ? "\t" : "", skipEmptyLines: true });
    return out.data;
  }, [text, name]);
  if (parsed.length === 0) return <p className="muted">This file is empty.</p>;
  const [head, ...rows] = parsed;
  const shown = rows.slice(0, MAX_ROWS);
  // A column whose every filled cell is a number lines up on the right, as in a spreadsheet.
  const numeric = head!.map((_, j) => {
    const cells = shown.map((r) => (r[j] ?? "").trim()).filter(Boolean);
    return cells.length > 0 && cells.every((c) => NUMBER.test(c));
  });
  return (
    <div className="csv-view">
      <table>
        <thead>
          <tr>
            {head!.map((h, i) => (
              <th key={i} scope="col" className={numeric[i] ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {head!.map((_, j) => (
                <td key={j} className={numeric[j] ? "num" : undefined}>
                  {r[j] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        {rows.length} {rows.length === 1 ? "row" : "rows"}
        {rows.length > MAX_ROWS ? `, first ${MAX_ROWS} shown. Open raw for the rest.` : ""}
      </p>
    </div>
  );
}
