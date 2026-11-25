import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderPage } from "../test/render.js";
import { CardLink, CardPanelContext, runFromHash } from "./CardPanel.js";

describe("CardLink", () => {
  it("opens the card in the side panel and keeps the page", async () => {
    const open = vi.fn();
    const { router } = await renderPage(
      <CardPanelContext.Provider value={open}>
        <CardLink id="WP-7" hash="run-R-3">
          Fix the pump
        </CardLink>
      </CardPanelContext.Provider>,
    );
    const link = await screen.findByRole("link", { name: "Fix the pump" });
    // Still a real link to the case page, for a new tab.
    expect(link.getAttribute("href")).toBe("/packages/WP-7#run-R-3");
    fireEvent.click(link);
    expect(open).toHaveBeenCalledWith({ id: "WP-7", runLog: "R-3" });
    expect(router.state.location.pathname).toBe("/");
  });

  it("leaves Cmd/Ctrl-click to the browser", async () => {
    const open = vi.fn();
    await renderPage(
      <CardPanelContext.Provider value={open}>
        <CardLink id="WP-7">Fix the pump</CardLink>
      </CardPanelContext.Provider>,
    );
    const link = await screen.findByRole("link", { name: "Fix the pump" });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(open).not.toHaveBeenCalled();
  });

  it("is a plain link where no shell offers the panel", async () => {
    const { router } = await renderPage(<CardLink id="WP-7">Fix the pump</CardLink>);
    fireEvent.click(await screen.findByRole("link", { name: "Fix the pump" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/packages/WP-7"));
  });

  it("reads a run from the hash", () => {
    expect(runFromHash("run-R-1")).toBe("R-1");
    expect(runFromHash("decide")).toBeUndefined();
    expect(runFromHash(undefined)).toBeUndefined();
  });
});
