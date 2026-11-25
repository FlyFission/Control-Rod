import { useEffect, useState } from "react";
import type { Artifact } from "../../api/types.js";
import { api } from "../../api/client.js";
import { Preview } from "../../components/OutputPreview.js";
import { isDiffName } from "../../lib/diff.js";
import { baseName, shortDigest } from "../../lib/format.js";
import { usePanelScreen, type PanelScreen } from "../../components/PanelScreen.js";

/** An output at the side panel's full size: the file is the title, its own viewer the body. */
export function fileScreen(packageId: string, artifact: Artifact): PanelScreen {
  const href = api.outputUrl(packageId, artifact.path);
  const name = baseName(artifact.path);
  return {
    key: `file:${artifact.path}:${artifact.digest.value}`,
    title: name,
    mono: true,
    links: (
      <>
        <a href={href} className="link" target="_blank" rel="noreferrer">
          Open in a new tab
        </a>
        <a href={href} className="link" download={name}>
          Download
        </a>
      </>
    ),
    meta: (
      <span className="mono">
        {artifact.path} · {shortDigest(artifact.digest)}
      </span>
    ),
    body: <Preview href={`${href}?d=${artifact.digest.value}`} name={name} />,
  };
}

/** The output opened first: a diff or patch, else the first one produced. */
export function defaultOutput(outputs: readonly Artifact[]): Artifact | undefined {
  return outputs.find((o) => isDiffName(o.path)) ?? outputs[0];
}

/**
 * The cockpit's outputs preview: the produced files as a short list, the chosen one drawn below it
 * at once (a `.diff` or `.patch` as a unified diff), so nothing waits behind a Preview button.
 */
export function DrawerOutputs({ packageId, outputs, loading }: { packageId: string; outputs: readonly Artifact[]; loading: boolean }) {
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const openScreen = usePanelScreen();
  // A new package starts from its own default; an output that went away falls back to the default.
  useEffect(() => setChosen(undefined), [packageId]);
  const current = outputs.find((o) => o.path === chosen) ?? defaultOutput(outputs);
  if (loading && outputs.length === 0) return <p className="small muted">Loading outputs…</p>;
  if (outputs.length === 0) return <p className="small muted">No outputs produced yet.</p>;
  const href = current ? api.outputUrl(packageId, current.path) : undefined;
  return (
    <div className="bd-outputs">
      <ul className="bd-output-list" aria-label="Produced outputs">
        {outputs.map((o) => {
          const on = o.path === current?.path;
          return (
            <li key={o.path}>
              <button
                type="button"
                className={on ? "bd-output-btn on" : "bd-output-btn"}
                aria-pressed={on}
                onClick={() => setChosen(o.path)}
              >
                <span className="mono bd-output-name">{o.path}</span>
                <span className="mono muted bd-output-digest">{shortDigest(o.digest)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {current && href && (
        <div className="bd-output-view" key={current.path}>
          <div className="bd-output-bar">
            <span className="mono small">{baseName(current.path)}</span>
            <span className="bd-output-links">
              {openScreen && (
                <button type="button" className="btn ghost small" onClick={() => openScreen(fileScreen(packageId, current))}>
                  Expand
                </button>
              )}
              <a href={href} className="link small" target="_blank" rel="noreferrer">
                Open raw
              </a>
            </span>
          </div>
          <Preview href={`${href}?d=${current.digest.value}`} name={baseName(current.path)} />
        </div>
      )}
    </div>
  );
}
