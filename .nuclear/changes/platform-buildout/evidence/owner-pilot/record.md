# Owner pilot record

Filled in by the owner while following [docs/owner-pilot.md](../../../../../docs/owner-pilot.md). Write what you saw, including failures and surprises. Leave a row blank if you skipped it, and say why under Notes. Do not paste passwords, tokens, the database dump or authenticator serial numbers here.

**Status:** not yet run. Nothing below is a result until the owner fills it in.

## Setup

| Item | Value |
|---|---|
| Date | |
| Commit (`git rev-parse HEAD`) | |
| OS and version | |
| Browser and version | |
| Authenticator kind (hardware key / platform) | |
| Claude Code version, Codex installed? | |
| Agents run in this pilot? (yes / API only) | |

## Steps

| Step | Expected | What happened | Pass / fail / skipped |
|---|---|---|---|
| 1. Register passkey | Registration succeeds | | |
| 1. Sign out and back in | Fresh passkey sign-in succeeds | | |
| 1. Cancel a passkey prompt | Stays signed out; message noted | | |
| 2. Confirm with an open question | Refused | | |
| 2. Confirm after answering | Signed confirmation in history | | |
| 2. Technical-plan edit after confirming | Confirmation kept | | |
| 2. Requirement edit after confirming | Confirmation invalidated | | |
| 3. Release | Signed release; author run queued | | |
| 3. Author and checker runs | Runs complete, or checker held for independence | | |
| 3. Independence override (if used) | Reason and passkey recorded; shared runtime shown | | |
| 3. Accept or return | Your decision, signed | | |
| 4. Stale-source refusal | Claim refused as stale; nothing runs on changed bytes | | |
| 5. HVAC request without inputs | Held; no author run; no invented values | | |
| 6. Backup | Dump created | | |
| 6. Restore into empty database | Restore completes without errors | | |
| 6. Restored copy | Same history; `/events/verify` intact; B still held | | |

## Recovery details

| Item | Value |
|---|---|
| Dump SHA-256 | |
| `pg_dump --version` | |
| Server version (`select version()`) | |

## Notes

Anything confusing, slow, or wrong, in your words. Include operator time if you tracked it.

## Owner judgment

Proceed / proceed with changes / stop, and why:

Signed (name and date):
