import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { codeLang, previewKind } from "../../lib/format.js";
import { CsvView, MAX_ROWS } from "./CsvView.js";
import { fixSymbolBullets } from "./DocxView.js";
import { MarkdownView, safeHref } from "./MarkdownView.js";
import { ViewerBoundary } from "./ViewerBoundary.js";

describe("previewKind", () => {
  it("picks a viewer for each kind of file", () => {
    expect(previewKind("out/plan.md")).toBe("markdown");
    expect(previewKind("a/b/report.PDF")).toBe("pdf");
    expect(previewKind("guide.docx")).toBe("docx");
    expect(previewKind("results.csv")).toBe("csv");
    expect(previewKind("results.tsv")).toBe("csv");
    expect(previewKind("main.py")).toBe("code");
    expect(previewKind("Dockerfile")).toBe("code");
    expect(previewKind("fix.patch")).toBe("diff");
    expect(previewKind("shot.webp")).toBe("image");
    expect(previewKind("notes.txt")).toBe("text");
    expect(previewKind("README")).toBe("text");
    expect(codeLang("x.tsx")).toBe("tsx");
    expect(codeLang("x.txt")).toBeUndefined();
  });
});

describe("MarkdownView", () => {
  it("draws GitHub tables and task lists, and drops unsafe links", () => {
    render(<MarkdownView text={"| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] open\n\n[bad](javascript:alert(1)) [good](https://example.com)"} />);
    expect(screen.getByRole("table")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.getByText("bad").tagName).toBe("SPAN");
    const good = screen.getByRole("link", { name: "good" });
    expect(good.getAttribute("target")).toBe("_blank");
    expect(good.getAttribute("rel")).toContain("noopener");
  });

  it("does not render raw HTML", () => {
    const { container } = render(<MarkdownView text={'<img src=x onerror="alert(1)"> hi'} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps only web, mail and in-page links", () => {
    expect(safeHref("https://a.b/c")).toBe("https://a.b/c");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeHref("#part")).toBe("#part");
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("javascript:x")).toBeUndefined();
    expect(safeHref("docs/x.md")).toBeUndefined();
  });
});

describe("CsvView", () => {
  it("uses the first row as the header and lines numbers up on the right", () => {
    render(<CsvView name="r.csv" text={"name,seconds\nalpha,0.41\nbeta,12"} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["name", "seconds"]);
    expect(screen.getByText("0.41").className).toBe("num");
    expect(screen.getByText("alpha").className).toBe("");
    expect(screen.getByText("2 rows")).toBeTruthy();
  });

  it("reads tabs in a .tsv and says when rows are cut", () => {
    const rows = Array.from({ length: MAX_ROWS + 5 }, (_, i) => `r${i}\t${i}`).join("\n");
    render(<CsvView name="r.tsv" text={`a\tb\n${rows}`} />);
    expect(screen.getByText(/first 1000 shown/)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(MAX_ROWS + 1);
  });
});

describe("fixSymbolBullets", () => {
  it("gives Symbol and Wingdings bullets a real glyph", () => {
    const css = 'p.docx-num-1-0:before {\n  content: "\\9";\n  counter-increment: docx-num-1-0;\n  font-family: Symbol;\n}';
    const out = fixSymbolBullets(css);
    expect(out).toContain('content: "\\2022\\9"');
    expect(out).toContain("font-family: inherit;");
    expect(fixSymbolBullets(css.replace("Symbol", "Wingdings"))).toContain("\\25AA");
    // Numbered lists are left alone.
    const numbered = 'p.docx-num-2-0:before {\n  content: counter(docx-num-2-0) ".";\n}';
    expect(fixSymbolBullets(numbered)).toBe(numbered);
  });
});

describe("ViewerBoundary", () => {
  it("shows a plain line and the raw link when a viewer throws", () => {
    const Boom = () => {
      throw new Error("bad file");
    };
    const err = console.error;
    console.error = () => undefined;
    render(
      <ViewerBoundary href="/raw" resetKey="a">
        <Boom />
      </ViewerBoundary>,
    );
    console.error = err;
    expect(screen.getByText(/could not be shown here/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /new tab/ }).getAttribute("href")).toBe("/raw");
  });
});

describe("MarkdownView code blocks", () => {
  it("keeps a block with no language preformatted, and inline code plain", () => {
    const { container } = render(<MarkdownView text={"Run `ls`:\n\n```\nmkdir a\n  cd a\n```\n\n    indented\n      more\n"} />);
    const pres = container.querySelectorAll("pre");
    expect(pres.length).toBe(2);
    expect(pres[0]?.textContent?.trimEnd()).toBe("mkdir a\n  cd a");
    expect(pres[1]?.textContent?.trimEnd()).toBe("indented\n  more");
    expect(container.querySelector("p code")?.closest("pre")).toBeNull();
  });
});
