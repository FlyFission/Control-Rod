# Owner pilot: passkey, guided preparation and recovery

This is the owner's run of the procedure in [preparation-recovery.md](preparation-recovery.md), on your own machine, with your own passkey and browser. The fixture rehearsal already passed with virtual passkeys and a simulated daemon; this pilot checks what a test harness cannot supply. Write what you see in the [pilot record](../.nuclear/changes/platform-buildout/evidence/owner-pilot/record.md) as you go. A step that fails or surprises you is a result, not something to work around.

The pilot makes no deployment, compliance or engineering-acceptance claim. It is one person's operational check of a pre-alpha, owner-local build.

## Before you start

- macOS or Linux as an ordinary user (the embedded database refuses to run as root).
- Node 22+, pnpm, Go and uv on `PATH`; Claude Code signed in if you want real agent runs. `pnpm cr doctor` checks these.
- A passkey: a hardware key, or your platform authenticator. Use the one you would really sign decisions with.
- PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `createdb`) for the recovery drill. The embedded server does not ship them. On macOS: `brew install postgresql@17`; use its `bin` directory below.
- A browser that supports passkeys on `http://localhost`.

Use a separate home so the pilot never touches an existing `~/.controlrod`:

```sh
export CONTROLROD_HOME="$HOME/.controlrod-pilot"
```

Get the branch:

```sh
git fetch origin claude/magical-ritchie-e7t851
git switch claude/magical-ritchie-e7t851
pnpm install --frozen-lockfile
pnpm cr doctor
```

## 1. Passkey (enrollment flag only)

```sh
CONTROLROD_GUIDED_PREPARATION=1 pnpm cr start
```

Open http://localhost:7300. **Set up this machine** registers your passkey. Then sign out, close the tab, and sign in again with the passkey. Record the browser, OS and authenticator kind (not its serial number).

Expected: registration and a fresh sign-in both succeed. Also cancel one passkey prompt on purpose and note what the page tells you; it should leave you signed out.

## 2. Scenario A: a software bugfix through guided preparation

Pick a small, real defect you understand, in a repository you control. To pin a repository other than this one, list it in an owner config file and add `CONTROLROD_PREPARATION_CONFIG=<file>` to the start command ([source providers](guided-preparation.md#source-providers)). A defect in this repository works with no config.

1. Capture the request, open its draft and choose **Start guided preparation**.
2. Fill the problem (repro, expected, actual), requirements, acceptance criteria, technical plan and verification mapping. Pin the source file the fix depends on.
3. Leave one question open and try **Confirm requirements**. Expected: refused while a blocker is open.
4. Answer it, then confirm with your passkey. Expected: a signed confirmation appears in the history.
5. Make a technical-plan edit after confirming. Expected: the confirmation is kept. Edit a requirement. Expected: the confirmation is invalidated and must be signed again.

## 3. Release, runs and acceptance (prepared-release flag)

Stop (Ctrl+C) and restart with both flags:

```sh
CONTROLROD_GUIDED_PREPARATION=1 CONTROLROD_PREPARED_RELEASE=1 pnpm cr start
```

**Decide before you release.** `pnpm cr start` also starts the run daemon. After release it runs the author, and then the checker, as real Claude Code processes on this machine under your login, in a per-job workspace with a fixed tool list. Runtime confinement is not proved, so these runs are not sandboxed. If you don't want agents to run, start the API alone with `node services/api/dist/server.js` (same environment variables) and stop the scenario after the release check.

1. Release with your passkey. Expected: a signed release decision in the history and an author run queued.
2. If agents run: watch the author run, then the checker. Without Codex installed, the checker is held for an independent runtime; going ahead with Claude alone needs a written reason and a passkey-signed override, and the record shows the shared runtime. Record which you chose.
3. Read the per-criterion results and open each linked evidence file. Accept with your passkey only if you would accept the fix, otherwise return it with a reason. Either outcome is a valid pilot result.

## 4. Stale-source refusal

Use a second, throwaway package so scenario A stays clean. With the API running alone (no daemon), prepare and release a trivial package that pins one file, then change that file on disk. Now start the daemon, or `pnpm cr start` with both flags.

Expected: the run claim is refused as stale (`preparation-stale`) and nothing executes on the changed bytes. Note what the page shows, return the package with a reason, and restore the file.

## 5. Scenario B: an engineering request that must stay held

Capture an HVAC load request without loads, weather data or the governing code edition. Prepare it as far as you can.

Expected: the missing inputs stay as owner-assigned holds, no author run is queued, and nothing supplies a number you did not provide. A value that appears from nowhere is a failure; record it.

## 6. Recovery drill

Keep the pilot instance running; its embedded database listens on `127.0.0.1:7301`. Put the database password in a protected pass file instead of typing it into commands:

```sh
printf '127.0.0.1:7301:*:controlrod:%s\n' "$(cat "$CONTROLROD_HOME/pg.password")" > "$CONTROLROD_HOME/pgpass"
chmod 600 "$CONTROLROD_HOME/pgpass"
export PGPASSFILE="$CONTROLROD_HOME/pgpass" PG17=/opt/homebrew/opt/postgresql@17/bin
```

Back up, then restore into a new, empty database:

```sh
"$PG17/pg_dump" -h 127.0.0.1 -p 7301 -U controlrod --format=custom --no-owner --no-privileges --file "$CONTROLROD_HOME/pilot.dump" postgres
```

```sh
shasum -a 256 "$CONTROLROD_HOME/pilot.dump"
```

```sh
"$PG17/createdb" -h 127.0.0.1 -p 7301 -U controlrod pilot_restore
```

```sh
"$PG17/pg_restore" -h 127.0.0.1 -p 7301 -U controlrod --exit-on-error --no-owner --no-privileges --dbname pilot_restore "$CONTROLROD_HOME/pilot.dump"
```

Start a second API on the restored copy, with both flags off and no daemon:

```sh
CONTROLROD_HOME="$HOME/.controlrod-pilot-restore" CONTROLROD_PORT=7310 CONTROLROD_DATABASE_URL=postgres://controlrod@127.0.0.1:7301/pilot_restore node services/api/dist/server.js
```

Open http://localhost:7310 and sign in with the same passkey. Expected: the scenario A package, its confirmations, release, results and evidence open with the same history; http://localhost:7310/events/verify reports an intact chain; scenario B is still held. Record the dump's SHA-256 and the tool and server versions.

Then stop both instances. The backup holds your credential public keys and captured work: keep it private, and delete it when you are done.

## After the pilot

Send back the filled record. The pilot outcome is your judgment: proceed, proceed with changes, or stop. Assisted preparation, native confinement, main integration and deployment remain separate gates whatever the outcome.
