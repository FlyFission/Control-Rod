import { useEffect, useRef, useState } from "react";

/**
 * Word draws bullets with private glyphs of the Symbol and Wingdings fonts, which browsers do not have:
 * docx-preview leaves an empty or tab-only marker. Give those lists a real bullet in the page's font.
 */
export function fixSymbolBullets(css: string): string {
  return css.replace(/(:before\s*\{[^}]*?)content:\s*"([^"]*)";([^}]*?)font-family:\s*(Symbol|Wingdings)[^;]*;/g, (_m, pre: string, content: string, mid: string, font: string) => {
    const tab = content.includes("\\9") ? "\\9" : " ";
    const mark = font === "Wingdings" ? "\\25AA" : "\\2022";
    return `${pre}content: "${mark}${tab}";${mid}font-family: inherit;`;
  });
}

/**
 * A Word document drawn in the page by docx-preview (Apache-2.0): headings, lists, tables, images,
 * as one continuous column that fits the panel. Links other than web and mail links are removed.
 */
export default function DocxView({ data }: { data: ArrayBuffer }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    setFailed(false);
    el.replaceChildren();
    import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(data, el, undefined, { inWrapper: false, ignoreWidth: true, ignoreHeight: true, breakPages: false, renderComments: false, useBase64URL: true }),
      )
      .then(() => {
        if (!live) return;
        el.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href") ?? "";
          if (/^(https?:|mailto:|#)/i.test(href)) {
            if (!href.startsWith("#")) {
              a.setAttribute("target", "_blank");
              a.setAttribute("rel", "noreferrer noopener");
            }
          } else a.removeAttribute("href");
        });
        el.querySelectorAll("script, iframe, object, embed").forEach((n) => n.remove());
        el.querySelectorAll("style").forEach((st) => {
          st.textContent = fixSymbolBullets(st.textContent ?? "");
        });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [data]);
  return (
    <>
      {failed && <p className="error">This document could not be drawn. Download it to open it.</p>}
      <div ref={ref} className="docx-view" />
    </>
  );
}
