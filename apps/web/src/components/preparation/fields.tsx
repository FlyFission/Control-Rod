import type { ReactNode } from "react";
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
