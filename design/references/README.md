# Visual references

This is the reference board every visual change builds against. Read it, and the per-screen bar in [screens.md](screens.md), before you design or restyle any screen.

## How to use it

- Borrow the **move**, never the art. Each reference below names one or two specific things it does well. Copy the idea, then draw it in Control Rod's own nuclear control room language. Do not copy images, icons, layouts pixel for pixel, names or text.
- Screenshots of these products are not committed here, because they belong to their owners. Each entry links to the official page where the screens can be seen.
- A visual change is done when its screenshots pass every row of [screens.md](screens.md) for the screens it touches, and the owner says yes to the screenshots. A code review pass is not a visual pass.

## How the references were chosen

The owner asked for an objective set rather than a personal one. Each pick had to meet two tests:

1. **Evidence.** A jury design award or a jury-selected finalist place, from an award body that judges design: Apple Design Awards (ADA), Independent Games Festival (IGF), Game Developers Choice Awards (GDCA) or BAFTA Games. Community votes such as Product Hunt's Golden Kitty count only as a tie-breaker and are marked as such.
2. **Fit.** It solves a problem Control Rod has: a live system you watch, state you read at a glance, alarms, instruments, or a calm list of work.

Popular products with no design award found (for example Stripe's dashboard, Superhuman and Apple Fitness) were left out, even where their reputation is strong. Evidence was checked on 2026-11-24 from the pages listed below.

## The references

| # | Reference | Evidence | Strength of evidence | Where to see it | The move to borrow |
|---|---|---|---|---|---|
| 1 | Flighty (flight tracker) | ADA 2023, Interaction, winner ([ADA 2023](https://developer.apple.com/design/awards/2023/)) | Jury win | [flighty.com](https://flighty.com) | Live status as one huge, plain state ("Departs in 42 min"), a timeline under it, and colour used only for change and delay |
| 2 | Tide Guide | ADA 2026, Visuals and Graphics, winner; ADA 2026 and 2023, Interaction, finalist ([ADA](https://developer.apple.com/design/awards/)) | Jury win | App Store listing for Tide Guide | A live data instrument: one curve with a "now" marker that you read in a second, with the details folded beneath |
| 3 | Halide Mark II (pro camera) | ADA 2022, Visuals and Graphics, winner ([MacRumors list](https://www.macrumors.com/2022/06/06/apple-design-award-winners-2022/)) | Jury win | [halide.cam](https://halide.cam) | An instrument, not a form: fine-ruled readouts, dials and tactile controls that feel machined |
| 4 | Into the Breach (strategy game) | GDCA 2019, Best Design, winner; BAFTA 2019, Original Property, winner ([GDCA 2019](https://gamechoiceawards.com/archive-gdca-2019), [BAFTA 2019](https://www.bafta.org/games/awards/bafta-games-awards-nominations-winners-2019)) | Jury win | [subsetgames.com](https://subsetgames.com) | Every threat is drawn on the map before it happens, so the whole danger state reads at a glance |
| 5 | FTL: Faster Than Light (strategy game) | IGF 2013, Excellence in Design, winner ([MCV report](https://www.mcvuk.com/gdc-13-ftl-and-cart-life-lead-igf-awards/)) | Jury win | [subsetgames.com](https://subsetgames.com) | A cutaway of rooms with crew at stations, power bars per system, and rooms that visibly break and alarm |
| 6 | Things 3 (task manager) | ADA 2017, winner ([MacRumors list](https://www.macrumors.com/2017/06/07/2017-apple-design-award-winners-announced/)) | Jury win | [culturedcode.com/things](https://culturedcode.com/things/) | Calm, roomy hierarchy; finishing a task feels physical; empty states that feel like a reward |
| 7 | Frostpunk (city survival game) | GDCA 2019, Best Design, honourable mention; BAFTA 2019, Narrative, nominee ([GDCA 2019](https://gamechoiceawards.com/archive-gdca-2019)) | Jury finalist | [frostpunkgame.com](https://www.frostpunkgame.com) | One glowing heat core at the centre, the whole settlement arranged around it, and gauges for heat and stress |
| 8 | Mini Metro (transit game) | IGF 2016, Excellence in Visual Art and Excellence in Design, finalist (won Excellence in Audio) ([IGF](https://www.igf.com/article/igf-2019-inspirations-2016-excellence-audio-award-winner-mini-metro), [press kit](https://dinopoloclub.com/press/)) | Jury finalist | [dinopoloclub.com](https://dinopoloclub.com) | A live system drawn as a flat schematic, where motion along the lines is the data and pressure builds visibly |
| 9 | Linear (issue tracker) | Golden Kitty 2020, Productivity, winner ([Product Hunt](https://www.producthunt.com/products/linear/awards)) | Community vote only | [linear.app](https://linear.app) | Dense, keyboard-first lists; quiet chrome; one accent colour; type scale that does the hierarchy |

Alien: Isolation was considered and left out, because its awards were for audio, not its interface.

## Real control rooms

Control Rod's theme is a nuclear control room, so the strongest single rule comes from how real ones are designed. Modern "high-performance" process displays (the ISA-101 approach) keep the normal state grey and quiet and use colour only for an abnormal condition or something the operator must act on. Use that as the base rule: calm when healthy, unmistakable when not.
