# Codex 0.171.0: features qualified (2026-11-23)

Trigger: the owner's first macOS install (2026-11-23) refused Codex 0.171.0 for nine features left on.
Source: `codex-rs/features/src/lib.rs` at tag `rust-v0.171.0` of openai/codex (Apache-2.0), read for the
doc comment and spec of each. All nine are `Stage::Stable`, `default_enabled: true`.

| Feature | Upstream doc comment | Why it does not widen what an agent action reaches |
|---|---|---|
| `code_mode_host_grpc` | Use gRPC over stdio for the process-owned code-mode host. | Transport for `code_mode_host` (already qualified); stdio, no new reach. |
| `code_mode_host_output_truncation` | Truncate output in the process-owned code-mode host before sending it to Core. | Shortens output. |
| `guardian_include_additional_context` | Include standalone additional-context tool outputs in Guardian review history. | Only affects Guardian review, and `guardian_approval` is switched off on every run. |
| `incremental_tools_legacy` | Publish incremental tool declarations on regular Amazon Bedrock Responses. | How tool declarations are sent to a provider; adds no tool. |
| `incremental_tools_legacy_gcp` | Publish incremental tool declarations on regular GCP Responses. | Same, for GCP. |
| `retain_client_tool_outputs` | Honor client-requested tool-output retention across context windows. | Context retention across compaction. |
| `tui_workspace` | Enable workspace behavior for side conversations in the owned TUI. | TUI only; runs use `codex exec`. |
| `unified_image_budget` | Apply one shared pixel and token budget to every image, regardless of legacy detail hints. | Image token budget. |
| `untrusted_as_tool_output` | Render client-supplied untrusted context as standalone named tool outputs. | How untrusted context is framed to the model; protective, left on. |

Captured list: `daemon/internal/runner/testdata/codex-0.171.0-features.txt` (`codex features list` with
Control Rod's `--disable` switches and an empty `CODEX_HOME`, from the npm package `@openai/codex@0.171.0`,
stdout only). `TestCodex0171FeaturesAreQualified` fails without these entries (`red-codex-0.171.0.log`).
Limit: classification by the implementing agent from upstream comments, not a launch qualification run
with a live login; switching a feature off would be the conservative alternative.
