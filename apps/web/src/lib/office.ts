import type { OfficeItem } from "../api/types.js";

/** Things that hold an agent come first, then disputes, then work to accept, then releases. */
const KIND_ORDER: Record<OfficeItem["kind"], number> = {
  permission: 0,
  dispute: 1,
  accept: 2,
  release: 3,
};

export const KIND_LABEL: Record<OfficeItem["kind"], string> = {
  permission: "Permission",
  dispute: "Dispute",
  accept: "Accept",
  release: "Release",
};

/** Sorted by kind, then oldest first. Never mutates the input. */
export function sortOffice(items: OfficeItem[]): OfficeItem[] {
  return [...items].sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (k !== 0) return k;
    return Date.parse(a.since) - Date.parse(b.since);
  });
}

export function age(since: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(since)) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
