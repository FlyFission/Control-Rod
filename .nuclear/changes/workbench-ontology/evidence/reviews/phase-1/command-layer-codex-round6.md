Yes. The [current guard](services/api/src/commands/executor.ts:39) still permits single-statement transaction escapes. Source review only; no files modified or tests run. Below, `\r` denotes an actual carriage return.

| Attempted bypass | Outcome |
|---|---|
| Leading whitespace, including form feeds and Unicode whitespace | No escape: PostgreSQL’s ASCII whitespace is stripped; additional Unicode characters either get stripped conservatively or cannot prefix a transaction keyword. [Scanner](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/scan.l#L188-L212). |
| `; /* nested /* comment */ */ ; COMMIT` | Blocked. Leading empty statements, whitespace and block comments are repeatedly removed. |
| `--x\rCOMMIT`, `--x\rEND`, `--x\rROLLBACK` | **Bypass.** The helper searches only for LF and returns empty text here. PostgreSQL ends the comment at CR and executes the transaction command. [Scanner](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/scan.l#L188-L212). |
| `PREPARE/**/TRANSACTION 'x'` | **Bypass.** Comments separate SQL tokens, but fail the regex’s `\s+`. Successful preparation detaches the transaction; failed preparation cancels it. [Lexical rules](https://www.postgresql.org/docs/current/sql-syntax-lexical.html), [PREPARE TRANSACTION](https://www.postgresql.org/docs/17/sql-prepare-transaction.html). |
| `(COMMIT)` or `(ROLLBACK)` | Syntax error. Parentheses cannot wrap transaction statements. [Grammar](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/gram.y). |
| `SELECT 1; COMMIT` | Rejected: extended Parse permits only one statement. [Protocol](https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY). |
| `DO $$BEGIN COMMIT; END$$` or `CALL` of a committing procedure | Cannot control transactions inside the executor’s existing transaction block. [DO](https://www.postgresql.org/docs/17/sql-do.html), [CALL](https://www.postgresql.org/docs/17/sql-call.html). |
| `PREPARE p AS COMMIT`, then `EXECUTE p` | Invalid preparation: SQL `PREPARE` accepts data statements, excluding transaction commands. [PREPARE](https://www.postgresql.org/docs/current/sql-prepare.html). |

BLOCK