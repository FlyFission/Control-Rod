# Budgets (5.2), Codex round 3 and review threads: adjudication

Reviewed head 6e41a51. Codex confirmed the round 2 fixes and raised one finding; bot threads raised three more. All accepted.

| Finding | Disposition |
|---|---|
| Codex: suspended budgets still alert | Fixed. Crossings are recorded for active budgets only. Test: a suspended budget over its limit records no crossing. |
| Thread: reported zero tokens dropped by the daemon | Fixed. The daemon's token counts are nullable (`*int`), so a reported zero is sent as zero and a missing count is left out. Go test: zero kept, missing omitted. API test: a reported zero output count is recorded. |
| Thread: dropped or truncated usage events taken as complete | Fixed. A run with a `dropped` event or events past `MAX_RUN_EVENTS` records no token report, so it counts as reporting none and token use reads as at least. Test added. |
| Thread: `/runtimes` pins not organization scoped | Fixed. Pins are those of the caller's organization. Control Rod holds one active organization (migration 009), so the cross organization case cannot be built in a test today. |
| Outdated threads from round 1 code (rounding, calendar windows, reservation timestamps, unsized minute runs, settlement through reservations, daemon ceiling truncation) | Already fixed in 84888be and 6e41a51; replied on each. |
