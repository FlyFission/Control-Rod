Both Round 6 bypasses are closed in the current [executor.ts](services/api/src/commands/executor.ts:39). Source review only; no files modified or tests run.

| Check | Result |
|---|---|
| `--x\rCOMMIT` | Closed. `firstWord` ends line comments at CR or LF, exposing `commit`. |
| `PREPARE/**/TRANSACTION` | Closed. Every statement beginning with `prepare` is rejected. |
| Whitespace, nested comments, leading semicolons | Skipped correctly before checking the keyword, consistent with [PostgreSQL’s scanner](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/scan.l). |
| Keywords used as identifiers | No escape. Transaction syntax requires keyword tokens. Identifier suffixes cannot disguise those tokens; the shorter regex can cause conservative rejection. |
| `"COMMIT"` or `U&"..."` spelling COMMIT | No escape. These produce identifiers, not transaction keywords, even after Unicode decoding. [Scanner and parser](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/parser.c). |
| Other transaction commands; `DO` / `CALL` | All transaction-boundary keyword families are blocked by the [grammar](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/gram.y#L10314-L10440). Procedural transaction control is refused inside the existing transaction. [DO](https://www.postgresql.org/docs/17/sql-do.html), [CALL](https://www.postgresql.org/docs/17/sql-call.html). |
| Transaction settings | `SET TRANSACTION` can pass, subject to PostgreSQL’s restrictions. It changes characteristics, not transaction boundaries. Role nonmembership does not prohibit ordinary settings. [Documentation](https://www.postgresql.org/docs/17/sql-set-transaction.html). |

MERGE: No remaining single-statement bypass of executor transaction-boundary ownership identified under the stated assumptions.