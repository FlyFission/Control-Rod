import type { SigningSteps } from "../api/types.js";

export type SigningPreset = "light" | "balanced" | "everything";
export type StepMode = "auto" | "click" | "passkey";

/**
 * The three presets, in the words the Setup page shows. Balanced is the default for new projects:
 * nothing is accepted or handed over without the person's passkey. Light is a choice the person
 * makes on purpose, and its words say plainly that it starts and accepts work on its own.
 */
export const SIGNING_PRESETS: readonly { id: SigningPreset; label: string; detail: string; steps: SigningSteps }[] = [
  {
    id: "light",
    label: "Light",
    detail:
      "Cards start on their own, and work that passes its check is accepted and handed over on its own. You are not asked to sign either. Your passkey is only for big things: these settings, deleting a project, restarting after a SCRAM.",
    steps: { release: "auto", accept: "auto", return: "click", reject: "click" },
  },
  {
    id: "balanced",
    label: "Balanced",
    detail: "Cards start on their own. You sign each accept with your passkey before the work is handed over.",
    steps: { release: "auto", accept: "passkey", return: "click", reject: "click" },
  },
  {
    id: "everything",
    label: "Everything",
    detail: "You press and sign every release, accept, return and reject.",
    steps: { release: "passkey", accept: "passkey", return: "passkey", reject: "passkey" },
  },
];

/** The preset a new project starts at. The server's own default (signing-policy.ts) says the same. */
export const DEFAULT_SIGNING_PRESET: SigningPreset = "balanced";

/** The preset with this id. */
export function signingPreset(id: SigningPreset): (typeof SIGNING_PRESETS)[number] {
  return SIGNING_PRESETS.find((p) => p.id === id)!;
}

/** What every step is when no settings are saved, or on Nuclear-grade work: signed with the passkey. */
export const ALL_SIGNED: SigningSteps = signingPreset("everything").steps;

const RELEASE_WORDS: Record<StepMode, string> = {
  auto: "It starts on its own once the plan is drafted",
  click: "It starts when you press Release",
  passkey: "Nothing starts until you sign its release with your passkey",
};

const ACCEPT_WORDS: Record<StepMode, string> = {
  auto: "work that passes its check is accepted and handed over on its own",
  click: "you press Accept before the work is handed over",
  passkey: "you sign each accept with your passkey before the work is handed over",
};

/**
 * One sentence on how a routine card goes under a project's signing steps: who starts it, and who
 * accepts it. Pass ALL_SIGNED where no settings are saved or the work is Nuclear-grade, since the
 * server then asks for the passkey at every step.
 */
export function cardFlowLine(steps: SigningSteps): string {
  return `${RELEASE_WORDS[steps.release]}, and ${ACCEPT_WORDS[steps.accept]}.`;
}

/**
 * The signing steps the server applies to a project's routine cards: its saved settings, or every
 * step signed when it has none or is Nuclear-grade.
 */
export function projectSteps(project: { mode?: string; signing?: { steps: SigningSteps } | undefined }): SigningSteps {
  if (project.mode === "nuclear-grade") return ALL_SIGNED;
  return project.signing?.steps ?? ALL_SIGNED;
}

export const STEP_LABEL: Record<keyof SigningSteps, string> = {
  release: "Start a card (release)",
  accept: "Accept work that passed its check",
  return: "Send a card back",
  reject: "Reject a card",
};

export const MODE_LABEL: Record<StepMode, string> = {
  auto: "On its own",
  click: "A click",
  passkey: "Passkey",
};

/** Which modes each step may take: send-back and reject always need a person. */
export const STEP_MODES: Record<keyof SigningSteps, readonly StepMode[]> = {
  release: ["auto", "click", "passkey"],
  accept: ["auto", "click", "passkey"],
  return: ["click", "passkey"],
  reject: ["click", "passkey"],
};

export function presetOf(steps: SigningSteps): SigningPreset | "custom" {
  return SIGNING_PRESETS.find((p) => (Object.keys(p.steps) as (keyof SigningSteps)[]).every((k) => p.steps[k] === steps[k]))?.id ?? "custom";
}

const SIGNED_TODAY_KEY = "cr.passkey-steps";

/**
 * Counts the card steps this person signed with a passkey today, kept in this browser only. After
 * three in a day, the prompt under the buttons offers to let that kind of step go on its own.
 */
export function noteSigned(kind: string, now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(SIGNED_TODAY_KEY) ?? "{}") as { day?: string; counts?: Record<string, number> };
    const counts = raw.day === day ? (raw.counts ?? {}) : {};
    counts[kind] = (counts[kind] ?? 0) + 1;
    localStorage.setItem(SIGNED_TODAY_KEY, JSON.stringify({ day, counts }));
    return counts[kind];
  } catch {
    return 0;
  }
}

export function signedToday(kind: string, now = new Date()): number {
  try {
    const raw = JSON.parse(localStorage.getItem(SIGNED_TODAY_KEY) ?? "{}") as { day?: string; counts?: Record<string, number> };
    return raw.day === now.toISOString().slice(0, 10) ? (raw.counts?.[kind] ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * The one quiet line under a decision that will ask for a passkey: why it asks, and where to
 * change it. After three signed steps of one kind today it asks whether to let them go.
 */
export function passkeyHint(kind: string, label: string, preset: string | undefined, count: number): string {
  if (count >= 3) return `You've signed ${count} ${label.toLowerCase()}s today. Let these go without a passkey?`;
  if (!preset) return "Asks for your passkey because this project has no signing settings yet.";
  return `Asks for your passkey because your settings sign ${label.toLowerCase()}.`;
}
