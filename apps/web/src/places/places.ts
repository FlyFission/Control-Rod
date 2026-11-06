/**
 * The web places (specification 12). Each is a page in the shell's navigation and an entry in the
 * command palette. Order is the order people reach for them.
 */
export interface Place {
  to: string;
  label: string;
  /** One line for the palette and for screen readers. */
  purpose: string;
}

export const PLACES: Place[] = [
  { to: "/", label: "Board", purpose: "Every card by step: what needs you and what is waiting" },
  { to: "/inbox", label: "Inbox", purpose: "Decisions waiting on you, riskiest first" },
  { to: "/office", label: "Office", purpose: "The floor and the board: who is working on what" },
  { to: "/packages", label: "Packages", purpose: "Capture work and find every package" },
  { to: "/registers", label: "Registers", purpose: "Deliverables across every package" },
  { to: "/explore", label: "Explore", purpose: "Live exploration before work is packaged" },
  { to: "/roster", label: "Roster", purpose: "Runtimes, their versions and pins" },
  { to: "/usage", label: "Usage", purpose: "Whether the work is earning its place" },
  { to: "/records", label: "Records", purpose: "The event chain and its verification" },
  { to: "/policies", label: "Policies", purpose: "Floors in force, members and administration" },
];
