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
