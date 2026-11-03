import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { DataLane } from "../api/types.js";
import { LanePicker } from "./LanePicker.js";
import { FILE_LIMIT, composeCapture, readBytes, toBase64, type Attached } from "../lib/attachments.js";

/** The capture contract caps what a person types at 20,000 characters. Files ride as attachments. */
export const CAPTURE_LIMIT = 20000;

export function CaptureBox() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [lane, setLane] = useState<DataLane>("internal");
  const input = useRef<HTMLInputElement>(null);

  const send = useMutation({
    mutationFn: (body: string) => api.capture({ text: body, source: "web", lane }),
    onSuccess: () => {
      setText("");
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["captures"] });
    },
    onError: (e) => setError(explain(e, "Could not send.")),
  });

  async function attach(list: FileList | null | undefined) {
    setError(null);
    if (list === null || list === undefined) return;
    const added: Attached[] = [];
    for (const f of Array.from(list)) {
      if (f.size > FILE_LIMIT) {
        setError(`${f.name} is over 5 MB.`);
        continue;
      }
      try {
        added.push({ name: f.name, base64: toBase64(await readBytes(f)) });
      } catch {
        setError(`Could not read ${f.name}.`);
      }
    }
    setFiles((cur) => [...cur.filter((c) => !added.some((a) => a.name === c.name)), ...added]);
  }

  const typed = text.trim();
  const tooLong = typed.length > CAPTURE_LIMIT;
  const empty = typed.length === 0 && files.length === 0;

  function submit() {
    setError(null);
    if (empty) return;
    if (tooLong) {
      setError(`Too long for one capture (${typed.length.toLocaleString()} of ${CAPTURE_LIMIT.toLocaleString()} characters).`);
      return;
    }
    send.mutate(composeCapture(text, files));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    void attach(e.dataTransfer.files);
  }

  return (
    <section className="panel capture" aria-labelledby="capture-title">
      <h2 id="capture-title">What needs doing?</h2>
      <div
        className={over ? "dropzone over" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <label className="sr-only" htmlFor="capture-text">
          What needs doing?
        </label>
        <textarea
          id="capture-text"
          rows={4}
          value={text}
          placeholder="Site a facility for this project. Or ask a quick question."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
      </div>
      <div className="capture-actions">
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          id="capture-file"
          // The visible button opens it; it is labelled for assistive technology and not a second tab stop.
          aria-label="Attach parcel file"
          tabIndex={-1}
          accept=".kml,.kmz,.geojson,.json,.pdf,.png,.jpg,.jpeg,.txt,.csv,.zip"
          onChange={(e) => {
            void attach(e.target.files);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn ghost" onClick={() => input.current?.click()}>
          Attach parcel file
        </button>
        {files.map((f) => (
          <span key={f.name} className="chip">
            {f.name}
            <button
              type="button"
              className="chip-x"
              aria-label={`Remove ${f.name}`}
              onClick={() => setFiles((cur) => cur.filter((c) => c.name !== f.name))}
            >
              x
            </button>
          </span>
        ))}
        <LanePicker id="capture-lane" value={lane} onChange={setLane} />
        <span className={tooLong ? "count error" : "count muted"} aria-live="polite">
          {typed.length.toLocaleString()} / {CAPTURE_LIMIT.toLocaleString()}
        </span>
        <button type="button" className="btn primary" onClick={submit} disabled={send.isPending || empty}>
          {send.isPending ? "Sending" : "Send"}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
