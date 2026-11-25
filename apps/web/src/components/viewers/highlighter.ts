import type { HighlighterCore } from "shiki/core";

const THEME = "github-dark-default";
let core: Promise<HighlighterCore> | undefined;

/**
 * One Shiki highlighter for the app, on Shiki's JavaScript regex engine (no WebAssembly download),
 * with each language's grammar fetched the first time a file needs it.
 */
async function highlighter(): Promise<HighlighterCore> {
  core ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, theme] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/themes/github-dark-default.mjs"),
    ]);
    return createHighlighterCore({ themes: [theme.default], langs: [], engine: createJavaScriptRegexEngine() });
  })();
  return core;
}

/** Highlighted HTML (Shiki escapes the source), or undefined for a language it does not know. */
export async function highlight(code: string, lang: string): Promise<string | undefined> {
  const [hl, { bundledLanguages }] = await Promise.all([highlighter(), import("shiki/langs")]);
  const id = lang.toLowerCase();
  const loader = (bundledLanguages as Record<string, (typeof bundledLanguages)[keyof typeof bundledLanguages] | undefined>)[id];
  if (!loader) return undefined;
  if (!hl.getLoadedLanguages().includes(id)) await hl.loadLanguage(loader);
  return hl.codeToHtml(code, { lang: id, theme: THEME });
}
