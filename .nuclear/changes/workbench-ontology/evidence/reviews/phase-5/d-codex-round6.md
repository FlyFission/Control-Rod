No actionable defects found at `e62e895`.

The latest commit correctly renders refusal messages and recovery advice through `explain()`; its regression test covers both. The full `origin/main...HEAD` diff supports task 5.4 within its documented limits.

Validation: 33 web tests passed, web and API type checks passed, and both diffs passed whitespace checks. API integration and browser suites were not rerun.

MERGE