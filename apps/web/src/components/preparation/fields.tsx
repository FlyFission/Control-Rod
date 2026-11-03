import { type ReactNode, useEffect, useState } from "react";
export function Text({
  label,
  value,
  change,
  rows = 2,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  );
}
export function Line({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => change(e.target.value)} />
    </label>
  );
}
export function Select({
  label,
  value,
  change,
  children,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => change(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
export const itemId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
/**
 * A list edited one entry per line. The text area keeps exactly what the person types (so a new,
 * still empty line survives the keystroke that made it); the draft receives only non-empty, trimmed
 * entries. When the list changes from outside (another value loaded), the text follows it.
 */
export function Lines({ label, value, change, rows = 2 }: { label: string; value: string[]; change: (v: string[]) => void; rows?: number }) {
  const [raw, setRaw] = useState(value.join("\n"));
  useEffect(() => {
    setRaw((now) => (lines(now).join("\n") === value.join("\n") ? now : value.join("\n")));
  }, [value]);
  return (
    <Text
      label={label}
      rows={rows}
      value={raw}
      change={(v) => {
        setRaw(v);
        change(lines(v));
      }}
    />
  );
}
