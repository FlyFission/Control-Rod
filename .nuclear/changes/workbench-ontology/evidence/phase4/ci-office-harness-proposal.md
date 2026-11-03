# Proposal: run the office theme quality harness in CI (plan task 4.3)

Status: **proposed, unsigned.** `.github/workflows/` is a trust surface (AGENTS.md rule 2). This file proposes the change; nothing under `.github/workflows/` is edited until a person signs it.

## What exists without this change

- `apps/web/e2e/office-harness.spec.ts` measures every office theme on the draft harness page (`apps/web/office-harness.html`): contrast of every name plate, package code and state mark against the pixels actually drawn, plate edges against the scene, occlusion and fixed stacking, pointer interception, legibility at minimum zoom with 40 agents, frame budget and event to screen time, reduced motion, and state kept across a theme switch. A sensitivity case breaks the semantic layer three ways and requires each check to fail.
- It runs locally with `pnpm --filter @control-rod/web exec playwright test e2e/office-harness.spec.ts --project chromium`.
- CI already runs the unit half on every pull request through `pnpm -r run test`: the theme contract and SVG allowlist against both themes' served files and digests, the generator freshness check, the layout graph invariants and the stage's accessible structure.

What CI does not run today is any Playwright suite, so the pixel, hit testing and timing checks run only where someone runs them.

## Proposed change

Add one job to `.github/workflows/ci.yml`:

```yaml
  office-harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: jdx/mise-action@8418fedb1110381a0d3ba51a7a415d7c1b884550 # v5.2.2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @control-rod/web exec playwright install --with-deps chromium
      - name: Office theme quality harness
        env:
          OFFICE_HARNESS_EVIDENCE: ${{ runner.temp }}/office-harness.json
        run: pnpm --filter @control-rod/web exec playwright test e2e/office-harness.spec.ts e2e/build-isolation.spec.ts --project chromium --reporter=list
      - uses: actions/upload-artifact@<reviewed commit SHA> # pin before signing
        if: always()
        with:
          name: office-harness
          path: ${{ runner.temp }}/office-harness.json
```

The workflow does not use `actions/upload-artifact` yet, so its pin is left for the signer to choose and review; the other two pins are the ones the workflow already uses.

## Risks the signer should weigh

- **Timing on shared runners.** CI runs only the labelled smoke check (p95 frame below 33.3 ms, 30 frames per second); hosted runners are not the reference machine. The Q-10 check (60 frames per second) runs only where `OFFICE_REFERENCE_MACHINE` names the machine, and no reference machine has been designated yet: that is an owner decision. A candidate run on the development machine (Ryzen 9 5900X, WSL2, Chromium 156) measured p95 16.8 ms. If the smoke check proves flaky in CI, the response is a recorded runner baseline, not a looser assertion without a record.
- **Browser download.** `playwright install --with-deps` fetches Chromium from Microsoft's CDN at the version the lockfile's Playwright pins. That is an outside download in CI, as the existing Rust and Go toolchain installs already are.
- **Run time.** About a minute for the build plus 20 seconds of tests.

## Signature

| Role | Name | Date | Decision |
|---|---|---|---|
| Owner | | | |
