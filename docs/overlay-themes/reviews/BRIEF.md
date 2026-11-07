# Adversarial Review Brief: Working World Themes Quality & Fidelity Audit

You are an independent, adversarial reviewer. Your task is to rigorously critique the enhanced Working World overlay themes in Control Rod.
Do not flatter. Be specific, cite exact files, line numbers, and SVG elements. Read only: do not edit files, install packages, or mutate repository state.

## The Objective 10/10 Rubric

Each theme must be graded from 1 to 10 across these five objective criteria. The threshold for acceptance is **10/10 across all five criteria**:

1. **Genre Resonance & Thematic Atmosphere (1-10)**: Does someone immediately recognize the intended world and creative genre (e.g. woodland adventuring guild, confectionery factory, midnight casino/heist, monster sorting depot, voxel quarry) without relying on trademarked text or labels?
2. **Medium-Specific Craftsmanship (1-10)**: Is the medium executed with mastery?
   - For pixel themes (*The Lantern Woods Guild*, *Blockworks Foundry*, *Critter Expedition Camp*): strict grid alignment, authentic 16-bit dithering, crisp stepped pixel geometry, zero mixels.
   - For illustrative/cinematic themes (*Heist Night*, *The Chocolate Factory*, *The Cloudspring Baths*, etc.): rich lighting depth, distinctive silhouettes, evocative architectural perspective.
3. **Cleanroom IP & Originality Boundary (1-10)**: Strict compliance with `docs/overlay-themes/originality.md`. Zero trademarked logos, franchise names, or direct copies of protected character likenesses. 100% original Apache-2.0 geometry.
4. **Workbench Station Ergonomics & Clarity (1-10)**: Clear visibility of the 6 semantic stations (`general`, `site`, `archive`, `verify`, `office`, `bench`) with quiet functional backplates. Scenery must not obscure active task cards, focus rings, or run badges.
5. **Technical Conformance & Performance (1-10)**: Valid schema (`ThemePackV1`), verified SHA-256 asset manifests in `assets.json`, lightweight SVG byte footprints (<30KB scene, <2KB character), instant 60fps rendering, zero vitest/lint failures.

## Files to Review

- Spec & Rules: `docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md`, `docs/overlay-themes/originality.md`
- Code & Generators: `tools/build_theme_art.py`, `tools/theme_art_backdrops.py`, `tools/theme_art_casts.py`, `tools/theme_art_props.py`
- Theme Packs & Catalog: `apps/web/src/features/floor/themes/catalog.ts`, `apps/web/src/features/floor/themes/packs/*.ts`
- Generated Assets: `apps/web/public/floor-themes/*/scene.*.svg`, `apps/web/public/floor-themes/*/assets.json`

## Required Output Format

Provide:
1. **Executive Verdict**: 1-paragraph summary.
2. **Scorecard Matrix**: A table scoring all 15 themes across the 5 criteria (1-10 scale), with an overall score.
3. **Numbered Adversarial Findings**: Severity (Critical, Major, Minor), finding, evidence, and concrete recommendation.
4. **The Top Improvements Required**: Specific changes needed before awarding a unanimous 10/10.
