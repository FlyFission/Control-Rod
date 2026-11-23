# User demand study, November 2026

Two scripted studies behind ADR 0024. Every number in the ADR comes from these files. The weights and codes are judgment and are recorded here so anyone can change them and re-run.

## Results

- **Persona model** (`personas/`). Of 100 modeled people, 46 put "know the result is right before I merge" in their top three, the highest score. "Use the subscriptions I already pay for, and see limits and cost" is the widest need: 71 of 100 name it. "Plain language for people who do not live in git" is top three for 30. When each need's market weakness is moved one step either way (28 runs), four needs stay in the top five every time: checking, existing subscriptions, plain language, and a record to hand someone.
- **Issue demand** (`repos/`). 15 repositories, 29,938 issues and 64,750 pull requests captured on 2026-11-23. Of the 60 most-reacted issues, the largest group is "bring any model or agent to the table, with fallback" (9 issues, 348 reactions). Next come "reach the same agents from anywhere" (6, 174) and "simpler, out of the way, an off switch" (6, 173). None of the 60 asks for review, diff or verification. Full counts are in `repos/top60_counts.txt` and `repos/counts_all.json`.

## Repositories read

Paradev, Kandev, Orchestrator, Multica, Vibe Kanban, Paperclip, emdash, Nimbalyst, Crystal, Mistral Vibe, claude-squad, agent-of-empires, herdr, herdr-app and oh-my-openagent. oh-my-opencode-slim was listed but its pull timed out. Conductor has no public repository. Only public issue and pull request titles, labels and reaction counts were read, through GitHub search. No source code was read. **What "captured" means:** `pull.py` asks GitHub search for items created from 2024-01-01 on, splitting the date range until each part has at most 1,000 results (the search limit). A single day with more than 1,000 items, or anything created before 2024, would be missed, so the counts are of captured titles, not of every title.

## Files

| File | What it is |
| --- | --- |
| `personas/inputs.json` | 20 archetypes summing to 100 people, their top and secondary pains, and each need's market weakness and effort |
| `personas/score.py`, `personas/outputs.json` | The scoring script and its output, with the input digest and the sensitivity run |
| `repos/snapshots/*.json.gz` | The captured titles, labels, states and reaction counts, one file per repository, sorted by issue number and gzipped with a fixed timestamp. Every repository result below is computed from these |
| `repos/snap.py` | Loads the snapshots and their SHA-256 values |
| `repos/pull.py`, `repos/pull_all.sh` | Re-pull a repository through `gh api search/issues` and pack it into a snapshot. New pulls will differ, because issues keep changing |
| `repos/rules.json`, `repos/classify.py`, `repos/counts.json` | Keyword themes for oh-my-openagent and herdr |
| `repos/rules_all.json`, `repos/classify_all.py`, `repos/counts_all.json` | The same with six orchestrator themes, across all 15 repositories, each weighted equally |
| `repos/onboarding_rules.json`, `repos/onboarding_count.py`, `repos/onboarding_counts.json` | Install, sign-in, detection and first-run themes (used by `docs/patterns/onboarding.md`) |
| `repos/top60.py`, `repos/top60.json` | Selects the 60 most-reacted issues; ties break by repository, then issue number |
| `repos/top60_codes.json`, `repos/tally_top60.py`, `repos/top60_counts.txt` | The hand coding (each issue named `<repository>#<number>`) and its tally |
| `reproduce.sh` | Re-runs every script and compares with the committed outputs |
| `SHA256SUMS` | Digests of every file here |

## Reproduce

```bash
bash docs/research/user-demand-2026-11/reproduce.sh
```

Each output prints "identical" when it matches byte for byte. Python 3 only; no network.

## Limits

- The personas are modeled, not interviewed.
- Keyword matching uses titles only and over-matches: for example "project" falls in the board theme and "test" and "check" in the review theme. No precision rate was recorded. The hand-coded top 60 is the cleaner signal.
- Issue writers are mostly power users already using these tools, so non-engineers are under-represented. Reactions skew toward popular repositories.
- Market weakness and effort in the persona model, and the top 60 coding, were set by the agent that ran the study.
