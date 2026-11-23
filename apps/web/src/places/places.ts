/**
 * The web places (specification 12). Each is a page in the shell's navigation and an entry in the
 * command palette. Order is the order people reach for them.
 */
export type PlaceGroup = "Work" | "Audit" | "Control";

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
  { to: "/registers", label: "Registers", purpose: "Deliverables across every package", group: "Audit" },
  { to: "/records", label: "Records", purpose: "The event chain and its verification", group: "Audit" },
  { to: "/usage", label: "Usage", purpose: "Whether the work is earning its place", group: "Audit" },
  { to: "/explore", label: "Explore", purpose: "Live exploration before work is packaged", group: "Control" },
  { to: "/roster", label: "Roster", purpose: "Runtimes, their versions and pins", group: "Control" },
  { to: "/policies", label: "Policies", purpose: "Floors in force, members and administration", group: "Control" },
  { to: "/settings/subscriptions", label: "Subscriptions", purpose: "Which provider CLIs are installed, signed in and qualified", group: "Control" },
];
