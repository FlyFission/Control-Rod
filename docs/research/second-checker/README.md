# The research behind Control Rod: figures and sources

The README and landing page cite eight published papers and one METR research note. Figures offered by assistants were checked against each paper before use; two that could not be found in the source (a ~75% ChatDev failure rate and a +14% gain from Cemri et al.) are left out. This folder holds what is quoted and how the SVG instruments are drawn, so anyone can check each number against its source.

- [`inputs.json`](inputs.json): each figure exactly as published, with the paper, the table or sentence it comes from, its license and the conditions it was measured under. Retrieved 2026-11-23.
- [`build.py`](build.py): generates [`second-checker.svg`](../../assets/readme/second-checker.svg), [`evidence-board.svg`](../../assets/readme/evidence-board.svg), [`council-loop.svg`](../../assets/readme/council-loop.svg), [`pr-receipt-card.svg`](../../assets/readme/pr-receipt-card.svg), and [`workflow-modes.svg`](../../assets/readme/workflow-modes.svg) under `docs/assets/readme/`. It types no empirical numbers; every research figure comes from `inputs.json`. Run `python3 docs/research/second-checker/build.py`.
- [`outputs.json`](outputs.json): the values shown and the SHA-256 digests of `inputs.json` and all five generated SVGs.

## Limits

- The chart's "outside checker" is a sound program (it checks graph colorings, arithmetic, and Blocksworld plans exactly), not a second language model. The papers show that self-checking can hurt (it helped on one task, Blocksworld) and that models favor themselves and similar models. None of them measures one vendor's agent reviewing another vendor's code—that is what [`bench/cross-check/`](../../../bench/cross-check/README.md) (`pnpm cr bench`) is built to measure on real tasks.
- The chart and the self-checking figures come from puzzles, math, question answering and summarization, not software changes. METR is the only cited study in which maintainers reviewed generated patches, and it is about test-passing patches, not self-checking.
- All charts and instrument panels are redrawn from published values; no figure image from any paper is copied.
