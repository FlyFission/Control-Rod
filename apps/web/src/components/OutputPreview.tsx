import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Artifact } from "../api/types.js";
import { DiffView } from "./DiffView.js";
import { baseName, codeLang, isGeoJson, previewKind, shortDigest } from "../lib/format.js";
import { CodeView } from "./viewers/CodeView.js";
import { ViewerBoundary } from "./viewers/ViewerBoundary.js";
import { CsvView } from "./viewers/CsvView.js";
import { MarkdownView } from "./viewers/MarkdownView.js";

const GeoMap = lazy(() => import("./GeoMap.js"));
const PdfView = lazy(() => import("./viewers/PdfView.js"));
const DocxView = lazy(() => import("./viewers/DocxView.js"));

/** One output, previewed on demand so the page does not download every file at once. */
export function OutputItem({ packageId, artifact }: { packageId: string; artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  const name = baseName(artifact.path);
  const href = api.outputUrl(packageId, artifact.path);
  return (
    <li className="output">
      <div className="output-head">
        <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Preview"}
        </button>
        <a href={href} className="link mono" target="_blank" rel="noreferrer">
          {artifact.path}
        </a>
        <span className="muted small mono">{shortDigest(artifact.digest)}</span>
      </div>
      {open && <Preview href={`${href}?d=${artifact.digest.value}`} name={name} />}
    </li>
  );
}

/**
 * The body of one output preview, without the Preview/Hide control: the drawer lays it out itself.
 * Each kind of file has its own viewer; the heavy ones (PDF, Word, maps) load only when needed.
 */
export function Preview({ href, name }: { href: string; name: string }) {
  return (
    <ViewerBoundary href={href} resetKey={href}>
      <PreviewBody href={href} name={name} />
    </ViewerBoundary>
  );
}

function PreviewBody({ href, name }: { href: string; name: string }) {
  const kind = previewKind(name);
  if (kind === "image") return <ImageView href={href} name={name} />;
  if (kind === "pdf") {
    return (
      <Suspense fallback={<p className="muted">Loading the PDF…</p>}>
        <PdfView href={href} />
      </Suspense>
    );
  }
  if (kind === "docx") return <DocxPreview href={href} />;
  return <TextPreview href={href} kind={kind} name={name} />;
}

/** Fits the panel; a click shows it at full size (scroll to pan) and back. */
function ImageView({ href, name }: { href: string; name: string }) {
  const [full, setFull] = useState(false);
  return (
    <div className={full ? "image-view full" : "image-view"}>
      <button type="button" className="image-view-btn" onClick={() => setFull((v) => !v)} aria-pressed={full} title={full ? "Fit to the panel" : "Show at full size"}>
        <img className="preview-img" src={href} alt={name} />
      </button>
    </div>
  );
}

function DocxPreview({ href }: { href: string }) {
  const q = useQuery({
    queryKey: ["output-bytes", href],
    queryFn: async () => {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Could not load (${res.status})`);
      return res.arrayBuffer();
    },
  });
  if (q.isLoading) return <p className="muted">Loading</p>;
  if (q.isError || q.data === undefined) return <p className="error">Could not load this output.</p>;
  return (
    <Suspense fallback={<p className="muted">Loading the document…</p>}>
      <DocxView data={q.data} />
    </Suspense>
  );
}

function TextPreview({ href, kind, name }: { href: string; kind: ReturnType<typeof previewKind>; name: string }) {
  const q = useQuery({
    queryKey: ["output", href],
    queryFn: async () => {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Could not load (${res.status})`);
      return res.text();
    },
  });
  if (q.isLoading) return <p className="muted">Loading</p>;
  if (q.isError || q.data === undefined) return <p className="error">Could not load this output.</p>;
  const text = q.data;
  if (kind === "diff") return <DiffView text={text} />;
  if (kind === "markdown") return <MarkdownView text={text} />;
  if (kind === "csv") return <CsvView text={text} name={name} />;
  if (kind === "code") return <CodeView code={text} lang={codeLang(name)} />;
  if (kind === "json" || kind === "geojson") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return <pre className="preview-text">{text}</pre>;
    }
    if (isGeoJson(parsed)) {
      return (
        <Suspense fallback={<p className="muted">Loading map</p>}>
          <GeoMap data={parsed} />
        </Suspense>
      );
    }
    return <CodeView code={JSON.stringify(parsed, null, 2)} lang="json" />;
  }
  return <pre className="preview-text">{text}</pre>;
}
