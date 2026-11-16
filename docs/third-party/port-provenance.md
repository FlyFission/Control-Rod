# Port provenance

Every port of code from another project carries a provenance file. The [register](register.md) says which files were ported; the provenance file says what happened to each one on the way in. The idea comes from Plannotator (pattern PL7 in [`docs/patterns/plannotator.md`](../patterns/plannotator.md)); no text or code is taken from it.

## Where it goes

`.nuclear/changes/<slug>/provenance.md`, in the change record of the port. Each register row for a code file names that path in its Local changes cell, and `python3 tools/check_register.py` checks that the file exists and has a row for the local path. Font and other asset rows do not need one.

## What it holds

Start from this outline and fill every cell. Write "none" or "n/a" rather than leaving a cell empty.

```markdown
# Provenance: <what was ported>

Source: <owner/repo> at <full 40 character commit>, license <SPDX id>, read on <date>.

| Local path | Upstream path (last commit touching it) | Removed | Renamed or changed | Tests carried |
| --- | --- | --- | --- | --- |
| `<local path>` | `<upstream path>` (<short commit>) | <what was left out, by name> | <renames, signature and behaviour changes> | <upstream tests ported, by name, and new tests> |

## Not carried

<Upstream files or functions near the port that were deliberately left out, and why.>

## Behaviour differences that could not be avoided

1. <Each place where the port behaves differently from upstream, what the caller must do about it, and the test that pins it.>
```

## Rules

- One row per local file. A file built from several upstream files names each of them.
- "Removed" and "Not carried" name things: functions, types, flags or files, not "some helpers".
- Every behaviour difference has a test, or says plainly that it has none.
- The register's other rules still apply: permissive source, full commit pin, retained license and notices.
