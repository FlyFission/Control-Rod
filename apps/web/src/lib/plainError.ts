/**
 * A runner's error, said in plain words for the person, with what to do about it. The runner's own
 * text stays available behind a toggle; this is only the first sentence a person reads.
 *
 * Patterns are matched on the runner's wording (daemon/internal and services/api), never on model
 * output. Anything unrecognised gets the honest general sentence rather than a guess.
 */
export interface PlainError {
  /** What happened, in one short sentence. */
  what: string;
  /** What the person can do, when there is something better than "run it again". */
  fix?: string;
}

const RULES: { test: RegExp; plain: PlainError }[] = [
  {
    // The login-folder fingerprint: a folder (usually ~/.codex with the Codex app's plugins) too large to hash.
    test: /login (directory|entry)[\s\S]*over the (\d+ )?byte limit/i,
    plain: {
      what: "The agent's sign-in folder was too large for the safety check to read, so the check stopped before it looked at the work.",
      fix: "Update Control Rod (controlrod update), then run it again.",
    },
  },
  {
    // The same fingerprint failing for another reason: the folder is missing, unreadable or not a folder.
    test: /login directory could not be hashed/i,
    plain: {
      what: "The safety check could not read the agent's sign-in folder, so it stopped before it looked at the work.",
      fix: "Check that the agent is installed and signed in on Setup, then run it again.",
    },
  },
  {
    // The checker answered, but not in the shape Control Rod reads: Control Rod's problem, not the work's.
    test: /(verification|criterion-results)\.json does not match the (checker )?schema|checker wrote no scratch\/verification\.json/i,
    plain: {
      what: "The checker's answer came back in a form Control Rod could not read, so the check did not count.",
      fix: "Run it again. If it keeps happening, pick another checker at the top of the Being checked column.",
    },
  },
  {
    test: /not (signed|logged) in|sign[- ]?in (has )?expired|unauthori[sz]ed|\b401\b|re-?authenticate|login required/i,
    plain: { what: "The agent is not signed in.", fix: "Sign in to it on Setup, then run it again." },
  },
  {
    test: /rate limit|usage limit|quota|\b429\b|too many requests/i,
    plain: { what: "The agent hit its usage limit.", fix: "Wait for the limit to reset, or pick another agent, then run it again." },
  },
  {
    test: /timed? ?out|deadline exceeded|lease expired/i,
    plain: { what: "It took too long and was stopped." },
  },
  {
    test: /no such file|not found on PATH|executable file not found|command not found|ENOENT/i,
    plain: { what: "The agent's program could not be found on this computer.", fix: "Check Setup to see which agents are installed, then run it again." },
  },
];

/** The plain sentence for a runner error; undefined when there is no error text at all. */
export function plainError(raw: string | undefined): PlainError | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  for (const r of RULES) if (r.test.test(text)) return r.plain;
  // A short sentence with no paths, codes or machine words is already plain: say it as it is.
  if (text.length <= 140 && !/[/\\{}<>=]|policy:|error:|exit (code|status)|errno|panic|stack|0x/i.test(text)) return { what: text };
  return { what: "Something went wrong while it ran." };
}

/**
 * The tag for an item, by what it asks of the person rather than the server's gate name ("Standard
 * gate"), so a glance says what to do (Focus writing, docs/reading-comfort.md). High-consequence work
 * says so first. An unknown kind keeps the server's label.
 */
const KIND_TAG: Record<string, string> = {
  scram: "Stopped for safety",
  permission: "An agent is waiting",
  lost: "Lost track of a run",
  dispute: "The check found problems",
  release: "Ready to start",
  accept: "Ready to accept",
  confirm: "Confirm the requirements",
};

/**
 * What the item says, in plain words. A run that failed is not a disagreement about the work, so it
 * is never called a dispute; the runner's own text moves under Details.
 */
export function plainItem(item: { kind?: string; detail?: string | undefined; risk: { label: string } }): { label: string; detail: string; raw?: string | undefined } {
  const failed = /^Run failed: ([\s\S]*)$/.exec(item.detail ?? "");
  if (failed) {
    const plain = plainError(failed[1]);
    return { label: "Did not finish", detail: plain ? `${plain.what}${plain.fix ? ` ${plain.fix}` : ""}` : "A run did not finish.", raw: failed[1] };
  }
  const tag = item.kind === "lost" && item.risk.label === "Outcome unknown" ? "Not sure the run stopped" : item.kind !== undefined ? KIND_TAG[item.kind] : undefined;
  const label = tag === undefined ? item.risk.label : /^High consequence/.test(item.risk.label) ? `High risk: ${tag.toLowerCase()}` : tag;
  return { label, detail: item.detail ?? "" };
}
