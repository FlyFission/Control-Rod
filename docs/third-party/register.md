# Borrowed code and asset register

Every file in this repository that was ported, translated or adapted from another project, and every third-party asset, is listed here before it merges (workbench specification section 32, WB-23). Concepts taken without code are cited in the pattern files under `docs/patterns/` instead.

Rules:

- Only MIT, Apache-2.0, BSD or ISC sources, pinned to a full commit, with the effective license checked at file and folder level. Font files may also use the SIL Open Font License 1.1, the standard license for web fonts.
- The upstream license text, any NOTICE file and the exact upstream path inventory are retained under `third_party/licenses/<owner>__<repo>/` before the first ported line.
- Apache-2.0 ports keep applicable notices, carry over upstream NOTICE attribution and mark modified files.
- A file that carries a provenance marker (`Ported from`, `Adapted from`, `Translated from`, `Derived from`, `SPDX-FileCopyrightText`) must have a row here.

`python3 tools/check_register.py` enforces the table and the markers. `python3 tools/check_register.py --donors <dir>` also compares repository code with pinned donor checkouts and reports undeclared overlap for review; a port that strips its marker and avoids literal overlap can still escape it, so review remains responsible.

## Register

| Local path | Upstream repository | Commit | Upstream path | License | Notice retained | Local changes |
|---|---|---|---|---|---|---|
| `apps/web/public/fonts/InterVariable.woff2` | `rsms/inter` | e3a3d4c57d5ecc01453a575621882a384c1995a3 | `web/InterVariable.woff2` in release `Inter-4.1.zip` | OFL-1.1 | yes | none; byte identical, sha256 in INVENTORY.txt |
| `apps/web/public/fonts/JetBrainsMono-Regular.woff2` | `JetBrains/JetBrainsMono` | cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9 | `fonts/webfonts/JetBrainsMono-Regular.woff2` in release `JetBrainsMono-2.304.zip` | OFL-1.1 | yes | none; byte identical, sha256 in INVENTORY.txt |
| `apps/web/public/fonts/JetBrainsMono-Medium.woff2` | `JetBrains/JetBrainsMono` | cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9 | `fonts/webfonts/JetBrainsMono-Medium.woff2` in release `JetBrainsMono-2.304.zip` | OFL-1.1 | yes | none; byte identical, sha256 in INVENTORY.txt |
| `apps/web/public/fonts/JetBrainsMono-SemiBold.woff2` | `JetBrains/JetBrainsMono` | cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9 | `fonts/webfonts/JetBrainsMono-SemiBold.woff2` in release `JetBrainsMono-2.304.zip` | OFL-1.1 | yes | none; byte identical, sha256 in INVENTORY.txt |

## Exit criteria

Every ported, translated or adapted file and asset has a complete row and retained license evidence.

## Source-lineage note

Register format defined by the workbench buildout plan, task 0.3.
