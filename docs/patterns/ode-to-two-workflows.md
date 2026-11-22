# Ode to two of my favorite workflows

Most agent work does not fail at the keyboard. It fails earlier, when nobody wrote down what "done" meant, and the agent filled the silence with confidence. Two bodies of work have done more than anything else I use to close that gap: Jesse Vincent's **Superpowers** and Matt Pocock's **skills**. This note is a thank-you, and a promise about how Control Rod carries them.

## Superpowers, by Jesse Vincent

**It refuses to let an agent start before it knows what it is building.** Superpowers opens with a design conversation that does not end until a person approves the design. Then it writes a plan for an engineer who has never seen the codebase: which files, which names, which tests prove each task. Then it hands each task to a fresh implementer and reviews the work before the next task starts.

The plan is the part I keep coming back to. A plan that names the exact file and the exact test is a plan another agent can pick up cold and finish. A vague plan just postpones the bill to review, where it costs more.

**It treats a claim of "done" as something you prove.** The rule is simple: no success claim without fresh command output in front of you. Test first, and code written before its test gets thrown away. That is strict on purpose. Strictness is cheaper than the bug it prevents.

And the implementer's report is honest by design. It can say done, done with concerns, blocked, or needs context. An agent that is allowed to say "I am not sure" is an agent you can trust when it says "done."

## Skills, by Matt Pocock

**It interviews you until the idea is sharp.** Matt's workflow starts with a relentless grilling about the plan, and it writes down what it learns as it goes: the glossary, the decisions, the reasons. The next session starts from a written record instead of a memory.

**It cuts work the right way.** Tickets are thin slices that run all the way through, each one naming what blocks it. Every slice can be built, tested and accepted on its own. Nobody spends a week on a layer that only works once everything else lands.

**It reviews on two axes, and that is the insight.** Does the code follow this repository's written standards? Does it do what the spec asked? Those are different questions, and most reviews blur them. Keeping them apart is how a review finds the thing that is well written and wrong.

Then it holds a retro, and the retro changes the environment, not the code: the checks, the standards, the instructions agents read. The next build starts from a better place. That is how a team stops paying for the same mistake twice.

## How Control Rod carries them

Both workflows are MIT licensed, and both authors are credited in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and in each pack's own `LICENSE`. Their skill files ship in Control Rod as they wrote them, pinned to a commit and checked by digest, so an agent reads Jesse's and Matt's words, not a paraphrase.

A card picks one workflow: the plain playbook, **Superpowers**, **Pocock**, or the hybrid, **Pocock Superpowers** (a working name until both authors have seen it). They never stack. Their plans, reviews and test rules disagree in small ways, and an agent handed both would have to choose, which is the person's job. The workflow is also a separate choice from the Nuclear-grade context: Nuclear sets how much evidence and decision discipline a run carries, and the workflow sets how the work is sequenced.

The hybrid takes Matt's two ends (the interview, the slicing, the two-axis review, the retro) and Jesse's middle (the plan format, the per-task implementer and its honest report, proof before "done"). It keeps no copy of either. It points at their packs, so it moves when they move.

Some things change on the way in, and I want to be plain about them. Control Rod runs every stage as its own recorded run, so the sub-agents both workflows spawn become separate agents the control plane schedules, each with its own record. The interviews happen in guided preparation, where a person answers. The agent never merges, pushes or files tickets itself; a person accepts the work, and only the control plane publishes. Reviewers run on an independent runtime and never see the author's transcript. None of that is a correction of either workflow. It is the price of signing your name to the result.

## Keeping pace

Both workflows keep getting better, and ours will not freeze at the commit we started from. Every two weeks or so, a script pulls each upstream, regenerates its pack, and writes a report of every skill added, changed, renamed or removed. A person reads that report before anything merges. These files are instructions to our agents, and instructions get read before they get trusted.

To Jesse and to Matt: thank you. You did the hard part, which was writing down how good work actually gets done.
