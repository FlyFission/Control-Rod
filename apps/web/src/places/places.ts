/**
 * The web places (specification 12). Each is a page in the shell's navigation and an entry in the
 * command palette. Order is the order people reach for them.
 */
export type PlaceGroup = "Work" | "Audit" | "Control / Setup";

export interface Place {
  to: string;
  label: string;
  /** One line for the palette and for screen readers. */
  purpose: string;
  group: PlaceGroup;
}

export const PLACES: Place[] = [
  { to: "/today", label: "Today", purpose: "Attention queue across Software and Capital Projects", group: "Work" },
  { to: "/", label: "Board", purpose: "Every card by step: what needs you and what is waiting", group: "Work" },
  { to: "/inbox", label: "Inbox", purpose: "Decisions waiting on you, riskiest first", group: "Work" },
  { to: "/plant", label: "Plant", purpose: "Who is working, where, and what needs you", group: "Work" },
  { to: "/packages", label: "Packages", purpose: "Capture work and find every package", group: "Work" },
  { to: "/compare", label: "Compare", purpose: "Side-by-side comparison of frozen revisions", group: "Audit" },
  { to: "/snapshots", label: "Snapshots", purpose: "Save a checkpoint or freeze a worktree to compare later", group: "Audit" },
  { to: "/registers", label: "Registers", purpose: "Deliverables across every package", group: "Audit" },
  { to: "/records", label: "Records", purpose: "The event chain and its verification", group: "Audit" },
  { to: "/usage", label: "Usage", purpose: "Whether the work is earning its place", group: "Audit" },
  { to: "/setup", label: "Setup", purpose: "Which agents sit at the table and when we check with you", group: "Control / Setup" },
  { to: "/agents", label: "Agents roster", purpose: "Turn agents on or off, see why one can't work, add more", group: "Control / Setup" },
  { to: "/policies", label: "Policies", purpose: "Floors in force, members and administration", group: "Control / Setup" },
];
