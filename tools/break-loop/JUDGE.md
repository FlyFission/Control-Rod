# Persona judge

The persona pass records journeys: a persona's brief, then for each step the goal, the time it took, the text on screen and a full-page screenshot, and where the scripted person got stuck. You judge each journey as that person, not as an engineer who knows the system.

For each journey file `apps/web/test-results/live-journeys/<persona>/journey-<browser>.json`:

1. Read the brief. Then, for each step, look at the screenshot before you read the screen text.
2. Ask, as that person:
   - **Confusing:** Could I tell what this screen is for, what state my work is in, and what to do next? Does any wording assume I know internals (runtime, lease, daemon, digest, lane) without saying why it matters to me? Does the screen say one thing while another part says the opposite?
   - **Slow:** Did a step take longer than the work needs? Was I left waiting with nothing telling me something was happening?
   - **Noisy:** Is there text, a badge, an error or a control I did not need for this goal and that pulled my attention? A raw command error, a stack trace, an internal id where a name would do?
   - **Stuck:** Where the journey has `stuck`, what would have unstuck me?
3. Write each problem as one finding: `{ "key": "persona|<persona>|<short-slug>", "severity": "major" if it stops the goal or misleads, else "minor", "pass": "persona", "title": "<one sentence, the person's words>", "detail": "<what the screen showed, which step, what would fix it>", "test": "persona <persona>", "browser": "<browser>", "evidence": ["<screenshot path>"] }`.

Keep the slug stable across passes (same problem, same slug) so the ledger counts it once. Do not report a matter of taste unless it costs the person time or a wrong decision. Three real findings beat ten opinions.
