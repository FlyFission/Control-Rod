import type { ActionDescriptor, WorkPackage } from "../api/types.js";
import type { Place } from "./places.js";

/** Where choosing a command takes the person. */
export interface Target {
  to: string;
  params?: Record<string, string>;
  hash?: string;
}

/** One palette entry: a place, a package, or a command from an ActionDescriptor. */
export interface Command {
  id: string;
  group: "Places" | "This package" | "Packages" | "Administration";
  label: string;
  hint?: string;
  allowed: boolean;
  /** For a command the viewer cannot take: why, and the one fact that would change it (WB-03). */
  reason?: string;
  change?: string;
  missing?: string[];
  floor?: boolean;
  /** Commands signed with a passkey say so before they are chosen. */
  signed?: boolean;
  target: Target;
}

const fromDescriptor = (d: ActionDescriptor, group: Command["group"], target: Target): Command => ({
  id: `${group}:${d.command}`,
  group,
  label: d.label,
  allowed: d.allowed,
  ...(d.reason !== undefined ? { reason: d.reason } : {}),
  ...(d.change !== undefined ? { change: d.change } : {}),
  ...(d.missing !== undefined && d.missing.length > 0 ? { missing: d.missing } : {}),
  ...(d.floor ? { floor: true } : {}),
  ...(d.signature === "direct" ? { signed: true } : {}),
  target,
});

/**
 * Every command the viewer can reach, in palette order: actions on the package being viewed, the
 * places, administrative commands, then packages. Commands the viewer may not take stay listed with
 * their reason, so the palette teaches rather than hides.
 */
export function buildCommands(input: {
  places: Place[];
  packages?: WorkPackage[];
  packageId?: string;
  packageActions?: ActionDescriptor[];
  adminActions?: ActionDescriptor[];
}): Command[] {
  const out: Command[] = [];
  if (input.packageId !== undefined) {
    const id = input.packageId;
    for (const d of input.packageActions ?? []) {
      // Decisions are signed on the decision bar; editing happens on the draft's criteria.
      const hash = d.command === "draft.edit" ? "criteria" : "decide";
      out.push(fromDescriptor(d, "This package", { to: "/packages/$id", params: { id }, hash }));
    }
  }
  for (const p of input.places) {
    out.push({ id: `place:${p.to}`, group: "Places", label: p.label, hint: p.purpose, allowed: true, target: { to: p.to } });
  }
  for (const d of input.adminActions ?? []) {
    // Administration is carried out on Policies, where each command has its own entry.
    out.push(fromDescriptor(d, "Administration", { to: "/policies", hash: `command-${d.command}` }));
  }
  for (const p of input.packages ?? []) {
    out.push({
      id: `package:${p.id}`,
      group: "Packages",
      label: p.title,
      hint: `${p.id} · ${p.status}`,
      allowed: true,
      target: { to: "/packages/$id", params: { id: p.id } },
    });
  }
  return out;
}

/**
 * The commands matching a query: every word must appear in the label, hint or group. Labels that
 * start with the query come first; otherwise palette order is kept.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return commands;
  const q = query.trim().toLowerCase();
  const hits = commands.filter((c) => {
    const text = `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const leading = hits.filter((c) => c.label.toLowerCase().startsWith(q));
  return [...leading, ...hits.filter((c) => !leading.includes(c))];
}
