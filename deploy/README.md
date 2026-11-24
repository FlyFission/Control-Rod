# deploy

Deployment artifacts and staged hosting configurations:

- [`github-pages.yml`](github-pages.yml): SHA-pinned GitHub Pages workflow that builds `site/dist` via `node scripts/build-site.mjs` and verifies offline/claim gates via `node --test scripts/test/site.test.mjs`. Kept in `deploy/` until copied to `.github/workflows/pages.yml` under a signed trust-surface review (`AGENTS.md` rule 2, `docs/collaboration.md#sole-maintainer-sign-off`).
- Planned (Phase 6): Docker Compose, Helm, and the offline air-gapped server bundle.
