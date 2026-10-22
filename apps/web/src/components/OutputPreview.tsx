import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { api } from "../api/client.js";
import type { Artifact } from "../api/types.js";
import { baseName, isGeoJson, previewKind, shortDigest } from "../lib/format.js";

const GeoMap = lazy(() => import("./GeoMap.js"));

/** One output, previewed on demand so the page does not download every file at once. */
export function OutputItem({ packageId, artifact }: { packageId: string; artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  const name = baseName(artifact.path);
  const href = api.outputUrl(packageId, name);
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
      {open && <Preview href={href} name={name} />}
    </li>
  );
}

function Preview({ href, name }: { href: string; name: string }) {
  const kind = previewKind(name);
  if (kind === "image") return <img className="preview-img" src={href} alt={name} />;
  if (kind === "pdf") return <iframe className="preview-pdf" src={href} title={name} />;
  return <TextPreview href={href} kind={kind} />;
}

function TextPreview({ href, kind }: { href: string; kind: ReturnType<typeof previewKind> }) {
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
  if (kind === "markdown") {
    return (
      <div className="markdown preview">
        <Markdown>{text}</Markdown>
      </div>
    );
  }
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
    return <pre className="preview-text">{JSON.stringify(parsed, null, 2)}</pre>;
  }
  return <pre className="preview-text">{text}</pre>;
}
