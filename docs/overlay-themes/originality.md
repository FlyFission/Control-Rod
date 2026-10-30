# Original worlds: naming, art and launch rules

Control Rod's Floor worlds are meant to be shared widely as open source. They must be fun to recognize as a *kind* of place and impossible to mistake for anyone else's property. This page is the rule set; `tools/check_originality.py` enforces the parts a machine can check.

This is an engineering practice, not legal advice. If a rights holder ever writes, follow the response steps at the end and get a lawyer's view before arguing.

## The line we stay on

Ideas, genres and moods are free to use: a candy factory, a heist crew, a woodland guild, a space shipyard, a cozy café. What belongs to others is their **expression and their marks**: character names and designs, logos and emblems, catchphrases, lyrics, distinctive costumes, set layouts, and anything that makes a reader think a world is endorsed by or connected to them.

## Naming rules (adjacent names)

Use plain descriptive words, then make them vivid with our own invention.

| Do | Don't |
|---|---|
| Generic place and genre words: Chocolate Factory, Heist Night, Starport, Lantern Woods | Any franchise, studio, character, place or product name |
| Our own invented proper nouns: Tumbletown, Cloudspring, Lanternwood | Sound-alike or pun names that point at a mark (rhymes, one letter off, spoonerisms) |
| One distinctive invented detail per world | A cluster of borrowed clues that together decode to one franchise |
| Taglines about the work and the mood | Quoted or near-quoted catchphrases, lyrics or titles |
| Comparisons by genre in docs ("a heist-movie mood") | "Like X", "inspired by X", "X-style" for any named franchise, anywhere, including READMEs, release notes, posts and video captions |

Stable world IDs never change; display names and taglines may be refined.

## Display name proposal (for owner choice)

Current titles are already generic. These alternatives push the fun further while staying on the line. Pick per world; IDs are unchanged.

| ID | Current title | Proposed display name | Tagline |
|---|---|---|---|
| `confectionery-works` | Confectionery Works | **The Chocolate Factory** | Where every package gets a candy-coated inspection. |
| `midnight-bureau` | Midnight Bureau | **Heist Night** | A crew of specialists, one careful plan, zero surprises. |
| `creature-dispatch` | Creature Dispatch | **The Monster Mailroom** | Big, gentle creatures who never lose a parcel. |
| `pocket-lab` | Pocket Lab | **Little Helpers Laboratory** | Tiny inventors, enormous equipment. |
| `lanternwood-guild` | Lanternwood Guild | **The Lantern Woods Guild** | Mapmakers, smiths and couriers on a quest for done. |
| `corner-cafe` | Corner Café | **The Coffee House Crew** | Good coffee, good company, everything shipped by Friday. |
| `tumbletown-workshop` | Tumbletown Workshop | **Tumbletown Rhyme Works** | Impossible machines that somehow pass inspection. |
| `orbital-shipyard` | Orbital Shipyard | **Starport Shipyard** | Robots, aliens and engineers keeping the fleet flying. |
| `wildlight-camp` | Wildlight Research Camp | **Critter Expedition Camp** | Your field team is small, furry and very thorough. |
| `voxel-foundry` | Voxel Foundry | **Blockworks Foundry** | Every deliverable built one cube at a time. |
| `cloudspring-bathhouse` | Cloudspring Bathhouse | **The Spirit Bathhouse** | Porcelain attendants, steam, and very careful records. |
| `button-and-spool` | Button & Spool | **Thimble Town** | A tiny workshop hidden inside the sewing drawer. |
| `clockwork-observatory` | Clockwork Observatory | **Clockwork Stargazers** | Brass automatons charting your work across the sky. |
| `coral-commons` | Coral Commons | **Reef Town** | An octopus, a seahorse and a very organized crab. |
| `meadow-post` | Meadow Post | **Cozy Critter Village** | Badgers, mice and a hedgehog who checks everything twice. |

Notes on the edges: "The Chocolate Factory" stays safe only if nothing else in the world adds that story's specific clues (no golden tickets, no boat on a chocolate river, no small workers in matching outfits). The café world avoids a fixed group size and signature furniture for the same reason. "Suffix -craft" is avoided for the voxel world because it points at one game.

## Art rules

Already in `docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md` and enforced in review:

- Original faces, proportions, silhouettes and costumes; no likeness of any existing character or performer.
- No emblems, insignia, logos, game interfaces, signature props or set layouts from existing works.
- No combination of colour, silhouette and costume that recalls an existing mascot.
- Artwork is generated in this repository (`tools/build_theme_art.py`) and released under Apache-2.0 with a per pack `NOTICE.txt`. No reference images are committed.
- Reviewer step before a pack is released: view the cast at full size beside the genre's best known works and ask "would a stranger name a specific franchise?" If yes, change the design.

## Launch and marketing

Viral posts are where projects get into trouble. In the README, release notes, demos, screenshots, videos and social posts:

- Describe worlds by our names and genres only. Never "[franchise]-style", "our [franchise] world" or similar, even jokingly.
- Do not use franchise hashtags, music, sound effects, fonts or logos.
- Do not invite comparisons ("guess which movie this is").

## Repository history

Earlier commits on the `feat/overlay-themes` branch contain franchise names in internal notes. Merge this pull request with **squash** so the target branch carries only the cleaned text. GitHub keeps pull request history, so the names remain visible in this PR's commits; rewriting that history is an owner decision.

## If a rights holder writes

1. Acknowledge promptly and politely.
2. Disable the named world in the next release (worlds are data; removal is one entry).
3. Record the request and the action in the change record.
4. Get legal advice before restoring or contesting.
