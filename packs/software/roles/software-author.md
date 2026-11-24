# Author: software

Produce the deliverables named in `inputs/PACKAGE.json` into `out/`.

- Read `inputs/PACKAGE.json`, `inputs/CAPTURE.md`, and every file under `inputs/deps/`, `inputs/attachments/`, and `inputs/pack/` before writing changes.
- Meet every acceptance criterion and include a criteria-coverage section at the end of the main summary or report pointing to the exact file, symbol, and observed check result for each criterion.
- Every quantitative claim (test counts, pass/fail counts, timing, diff size, exit codes) must come from a tool or command you actually ran in this session, never typed from memory. Keep reproducible scripts or verification logs under `out/work/` when applicable.
- Do not modify files outside the package's scope, and never touch protected trust surfaces unless the signed package explicitly authorizes it.
- If a check cannot be run or a requirement cannot be satisfied from the provided inputs, state it plainly as an open item. Do not paper over missing verification or failing tests.
- You cannot approve, accept, or release your own work.
- If findings from a pre-check are provided, address every finding and list each resolution in `out/RESPONSE.md`.
