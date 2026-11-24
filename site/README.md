# Control Rod Landing Site (`site/`)

Self-hosted, zero-dependency static marketing and interactive demo site for Control Rod.

## Design & trust rules

- **Zero third-party network requests:** fonts (`Inter`, `JetBrains Mono`), vendor marks (`Lobe Icons` MIT + `LICENSE`), deterministic SVGs, and release-build screenshots are assembled from repository-registered assets by `scripts/build-site.mjs`. No external CDNs, analytics, or trackers.
- **Same claim discipline as `README.md`:** `scripts/test/site.test.mjs` applies a JavaScript copy of `tools/check_public_claims.py`'s claim rules (keep the two in step) and `tools/check_offline_assets.py`'s remote-URL check against the built `site/dist/` bundle.
- **Visual bar:** built to [`design/references/README.md`](../design/references/README.md) and [`design/references/screens.md`](../design/references/screens.md) (ISA-101 calm control-room surfaces, Cherenkov cyan for active state, warm amber reserved for human gates, `prefers-reduced-motion` and hidden-tab pause, 1440px and 390px layouts).

## Build and preview locally

```sh
node scripts/build-site.mjs   # writes self-contained static bundle to site/dist/
node scripts/serve-site.mjs   # builds and serves http://localhost:7310 with self-only CSP
node --test scripts/test/site.test.mjs
```

## Deploy

See [`deploy/github-pages.yml`](../deploy/github-pages.yml) for the SHA-pinned GitHub Pages workflow.
