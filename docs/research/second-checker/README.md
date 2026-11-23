# Why a second model: the figures behind the README

The README's "Why a second model, not the same one" section quotes four published papers and one METR research note. This folder holds what it quotes and how the chart is drawn, so anyone can check each number against its source.

- [`inputs.json`](inputs.json): each figure exactly as published, with the paper, the table or sentence it comes from, its license and the conditions it was measured under. Retrieved 2026-11-23.
- [`build.py`](build.py): draws [`docs/assets/readme/second-checker.svg`](../../assets/readme/second-checker.svg) from `inputs.json`. It types no numbers. Run `python3 docs/research/second-checker/build.py`.
- [`outputs.json`](outputs.json): the values the chart shows, with the sha256 of the inputs and of the SVG.

## Limits

- The chart's "outside checker" is a sound program (it checks graph colorings and arithmetic exactly), not a second language model. The papers show that self-checking is weak and that models favor themselves and similar models. None of them measures one vendor's agent reviewing another vendor's code.
- The tasks are puzzles, math, question answering and summarization, not software changes.
- The chart is redrawn from Table 1's values; no figure image from any paper is copied.
