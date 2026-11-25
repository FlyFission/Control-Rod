import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// pdf.js (Mozilla, Apache-2.0) parses in a worker so a long PDF never freezes the page.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Pages drawn ahead of the reader at a time; more load as they scroll. */
const BATCH = 5;

/**
 * A PDF drawn page by page at the panel's width, text selectable, with the same look in every
 * browser (Safari's built-in viewer ignores the panel's width and theme).
 */
export default function PdfView({ href }: { href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  const [shown, setShown] = useState(BATCH);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setWidth(Math.max(240, Math.floor(el.clientWidth) - 2));
    set();
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={box} className="pdf-view">
      <Document
        file={href}
        onLoadSuccess={(d) => {
          setPages(d.numPages);
          setShown(Math.min(BATCH, d.numPages));
        }}
        loading={<p className="muted">Loading the PDF…</p>}
        error={<p className="error">This PDF could not be drawn. Open raw to view it in the browser.</p>}
      >
        {width > 0 &&
          Array.from({ length: Math.min(shown, pages) }, (_, i) => (
            <Page key={i} pageNumber={i + 1} width={width} className="pdf-page" loading={<div className="pdf-page-wait" style={{ height: width * 1.3 }} />} />
          ))}
      </Document>
      {pages > 0 && (
        <p className="small muted pdf-foot">
          {Math.min(shown, pages)} of {pages} {pages === 1 ? "page" : "pages"}
          {shown < pages && (
            <>
              {" "}
              <button type="button" className="btn ghost small" onClick={() => setShown((n) => Math.min(pages, n + BATCH * 2))}>
                Show more pages
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
