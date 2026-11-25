import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeView } from "./CodeView.js";

/** Only web and mail links open; anything else (javascript:, data:) is dropped. */
export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("#")) return href;
  try {
    const u = new URL(href, "https://x.invalid/");
    return ["http:", "https:", "mailto:"].includes(u.protocol) && u.host !== "x.invalid" ? href : undefined;
  } catch {
    return undefined;
  }
}

const components: Components = {
  a: ({ href, children }) => {
    const safe = safeHref(href);
    if (!safe) return <span>{children}</span>;
    return safe.startsWith("#") ? (
      <a href={safe}>{children}</a>
    ) : (
      <a href={safe} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  // Fenced blocks with a language get colours; inline code stays plain.
  code: ({ className, children }) => {
    const lang = /language-([\w+-]+)/.exec(className ?? "")?.[1];
    const text = String(children ?? "").replace(/\n$/, "");
    if (!lang) return <code className={className}>{children}</code>;
    return <CodeView code={text} lang={lang} numbered={false} />;
  },
  pre: ({ children }) => <>{children}</>,
};

/** Markdown as GitHub draws it: tables, task lists, strikethrough, autolinks (remark-gfm). Raw HTML is not rendered. */
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="markdown preview file-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
