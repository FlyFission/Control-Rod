# Reading comfort

How the web app sets type, contrast and live output so people can read it for hours. The rules come from one research report (see `.nuclear/changes/reading-comfort/basis.md` for what it found, how strong each finding is, and what we do not claim). Values live in `apps/web/src/design/tokens.css`; tests keep them there.

## Rules

| Area | Rule | Where it is kept |
|---|---|---|
| Text size | Readable text steps from `--fs-chip` (11px) up through `--fs-label`, `--fs-small` and `--fs-ui`, then 14px and larger as literals. Nothing readable is set below 14px except through a token. | `type-scale.test.ts` |
| Scene art | Labels inside a scaled scene (stations, figures, room and plate labels) size themselves with the scene. Anything exempt is listed in `type-scale.test.ts`; add to that list only when a list or card view already offers the same text full size. | `type-scale.test.ts` |
| Letter spacing | Each font's designed default. Tracking only on short all-caps labels. | `tokens.css` |
| Monospace blocks | `--lh-mono` line height for logs, previews and markdown code blocks. Not cramped, not open. | `tokens.css` |
| Prose width | `--measure` for agent prose and page intros. Code blocks and tables may run wider. | `styles.css` |
| Contrast | Every plain text colour at WCAG AA (4.5:1) or better; `--text`, `--text-2` and `--muted` at AAA (7:1) on every page ground. More contrast than that is not a goal. Fills the scan cannot read (translucent, `rgb()`, theme variables) are listed as recorded exceptions in the test, so a new one cannot slip in unseen. | `contrast.test.ts` |
| Motion | Pulses rest when the tab is hidden, under `prefers-reduced-motion`, and under the Floor's `quiet` and `still` settings. | `styles.css`, `useFloorMotion.ts` |
| Live output | A reader can pause a running log, see how many lines arrived meanwhile, and resume. Bursts of events are batched into one refresh. | `RunLog.tsx`, `live.ts` |

## Not decided here

- **Light mode.** The brand palette is charcoal with Cherenkov blue, and `floor.css` carries many fixed colours. A light theme that follows the room rather than the clock is a design decision, not a token swap.
- **User text-size setting.** Sizes are in px. Moving to rem, so browser text size applies, touches every rule and every scene.
- **Scene label size.** Station and figure codes in the scenes are still small. The list view is the full-size reading surface for the same data.
