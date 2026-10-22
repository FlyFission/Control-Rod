// Files ride inside a capture as fenced blocks the control plane extracts into stored files:
//   ```attachment name="parcel.kml" encoding="base64"
//   PD94bWwg...
//   ```

export interface Attached {
  name: string;
  base64: string;
}

export const FILE_LIMIT = 5 * 1024 * 1024;

/** Names cannot carry quotes or line breaks into the fence's info string. */
export function safeName(name: string): string {
  return name.replace(/["\r\n`]/g, "_");
}

export function composeCapture(text: string, files: Attached[]): string {
  const body = text.trim();
  const blocks = files.map(
    (f) => `\`\`\`attachment name="${safeName(f.name)}" encoding="base64"\n${f.base64}\n\`\`\``,
  );
  return [body, ...blocks].filter((s) => s.length > 0).join("\n\n");
}

const FENCE = /```attachment name="([^"]*)" encoding="base64"\n[\s\S]*?\n?```/g;

/** The visible text and the attached file names, for showing a capture without its base64. */
export function splitAttachments(text: string): { text: string; files: string[] } {
  const files: string[] = [];
  const visible = text.replace(FENCE, (_m, name: string) => {
    files.push(name);
    return "";
  });
  return { text: visible.trim(), files };
}

/** Reads a file as bytes. FileReader works everywhere Blob.arrayBuffer may be missing. */
export function readBytes(f: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error("Could not read the file."));
    r.readAsArrayBuffer(f);
  });
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
