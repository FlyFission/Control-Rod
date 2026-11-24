import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import { shortDigest } from "../lib/format.js";

export function RunOutputs({ packageId, runId, succeeded, initialOutput, onSelect }: {
  packageId: string;
  runId: string;
  succeeded: boolean;
  initialOutput?: number | undefined;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(initialOutput);
  const outputs = useInfiniteQuery({
    queryKey: ["run", packageId, runId, "outputs"],
    queryFn: ({ pageParam }) => api.runOutputs(packageId, runId, pageParam),
    initialPageParam: "",
    getNextPageParam: (page) => page.length === 200 ? page.at(-1)?.path : undefined,
    enabled: open && succeeded,
    retry: false,
  });
  const files = outputs.data?.pages.flat();
  const selected = index !== undefined ? files?.[index] : undefined;
  const path = selected?.path;
  const { hasNextPage, isFetchingNextPage, isError: listError, fetchNextPage } = outputs;
  useEffect(() => {
    if (open && succeeded && Number.isSafeInteger(index) && index! >= (files?.length ?? 0) &&
      hasNextPage && !isFetchingNextPage && !listError) void fetchNextPage();
  }, [open, succeeded, index, files?.length, hasNextPage, isFetchingNextPage, listError, fetchNextPage]);
  const preview = useQuery({
    queryKey: ["run", packageId, runId, "output-preview", path, selected?.digest.value],
    queryFn: () => api.runOutputPreview(packageId, runId, path!),
    enabled: open && succeeded && path !== undefined,
    retry: false,
  });

  return (
    <details className="run-outputs" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="btn small">Recorded outputs</summary>
      <p className="small muted">Files reported by this attempt. A verified repository comparison is unavailable.</p>
      {!succeeded && <p className="small muted">Outputs appear after a successful run.</p>}
      {succeeded && outputs.isPending && open && <p className="small muted" role="status">Loading outputs…</p>}
      {outputs.isError && (
        <div role="alert" className="small">
          {explain(outputs.error, "Could not load the recorded outputs.")}
          <button type="button" className="btn small" onClick={() => void outputs.refetch()}>Retry</button>
        </div>
      )}
      {files?.length === 0 && <p className="small muted">No outputs recorded for this attempt.</p>}
      {files && files.length > 0 && (
        <label className="field small">
          <span>File</span>
          <select
            value={selected && index !== undefined ? String(index) : ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setIndex(next);
              onSelect(next);
            }}
          >
            <option value="" disabled>Choose a file</option>
            {files.map((output, i) => <option key={output.path} value={i}>{output.path}</option>)}
          </select>
        </label>
      )}
      {outputs.hasNextPage && (
        <button type="button" className="btn small" disabled={outputs.isFetchingNextPage} onClick={() => void outputs.fetchNextPage()}>
          Load more files
        </button>
      )}
      {selected && (
        <>
          <p className="mono small muted">{shortDigest(selected.digest)}</p>
          {preview.isPending && open && <p className="small muted" role="status">Loading preview…</p>}
          {preview.isError && <p className="small" role="status">{explain(preview.error, "Preview unavailable.")}</p>}
          {preview.data && (preview.data.path !== selected.path || preview.data.digest.value !== selected.digest.value) &&
            <p className="small" role="alert">The recorded file changed. Refresh the outputs before reviewing it.</p>}
          {preview.data?.path === selected.path && preview.data.digest.value === selected.digest.value && !preview.isError && (
            <pre className="log run-output-preview" aria-label={`Preview of ${selected.path}`}>{preview.data.content}</pre>
          )}
        </>
      )}
    </details>
  );
}
