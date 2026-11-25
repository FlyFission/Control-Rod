import { useEffect, useState } from "react";

/** Past this, a file is shown as plain text: colouring it would stall the page. */
export const MAX_HIGHLIGHT_CHARS = 300_000;

/**
 * Code with syntax colours, from Shiki (MIT; the TextMate grammars VS Code uses). Shiki and each
 * language load only when a file needs them. Shiki escapes the source, so its HTML is safe to set.
 */
export function useHighlighted(code: string, lang: string | undefined): string | undefined {
  const [html, setHtml] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHtml(undefined);
    if (!lang || code.length > MAX_HIGHLIGHT_CHARS) return;
    let live = true;
    import("./highlighter.js")
      .then(({ highlight }) => highlight(code, lang))
      .then((out) => {
        if (live && out) setHtml(out);
      })
      .catch(() => undefined); // An unknown language stays plain text.
    return () => {
      live = false;
    };
  }, [code, lang]);
  return html;
}

export function CodeView({ code, lang, numbered = true }: { code: string; lang: string | undefined; numbered?: boolean }) {
  const html = useHighlighted(code, lang);
  if (html) return <div className={numbered ? "code-view numbered" : "code-view"} dangerouslySetInnerHTML={{ __html: html }} />;
  return <pre className="preview-text code-plain">{code}</pre>;
}
