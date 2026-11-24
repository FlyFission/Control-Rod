# Art provenance

Every raster asset under `design/art/` and `apps/web/public/plant/` is listed here with its source, prompt record and digest.

## Route

Images are generated with the image tool built into the Codex CLI (model `gpt-6.2-astra`), signed in with the owner's existing ChatGPT account. Each generation is image-to-image from `design/art/blockout/` (rendered by `tools/render_blockout.py`) so projection and room positions match. Exact prompts and digests for each batch are in that batch's `PROMPTS.md`.

These assets are AI-generated and are labelled as such here; they are not presented as hand-made.

## Terms

OpenAI Terms of Use, https://openai.com/policies/terms-of-use, effective 2026-01-01, read 2026-11-24:

- "As between you and OpenAI, and to the extent permitted by applicable law, you (a) retain your ownership rights in Input and (b) own the Output." "We hereby assign to you all our right, title, and interest, if any, in and to Output."
- No attribution requirement for Output. Users may not "Represent that Output was human-generated when it was not."
- The assignment "does not extend to other users' output"; other users may receive similar output.

## Batches

| Batch | Path | Prompt record |
|---|---|---|
| Step 0 key frames (three directions) | `design/art/keyframes/` | `design/art/keyframes/PROMPTS.md` |
