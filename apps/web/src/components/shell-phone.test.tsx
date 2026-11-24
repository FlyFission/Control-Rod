import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";

const ben = { registered: true, signed_in: true, user: "ben" } as Session;

function media(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
}
beforeEach(() => server.use(http.get("*/inbox", () => HttpResponse.json({ items: [{}, {}] }))));
afterEach(() => vi.unstubAllGlobals());

describe("the shell on a phone", () => {
  it("replaces the rail with a bottom bar of Board, Plant, Inbox, Today and More, and keeps the project switcher and New change in the top bar", async () => {
    media(true);
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const bar = screen.getByRole("navigation", { name: "Primary" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent?.replace(/\d+$/, ""))).toEqual(["Board", "Plant", "Inbox", "Today"]);
    expect(within(bar).getByRole("button", { name: "More" })).toBeTruthy();
    expect(await within(bar).findByLabelText("2 waiting on you")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Places" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Project" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New change" })).toBeTruthy();
    // The rod gauge and SCRAM stay in the top bar at every width.
    expect(screen.getByRole("img", { name: /Control rods/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "SCRAM" })).toBeTruthy();
  });

  it("opens More as a dialog with the other places, and Escape closes it and returns focus", async () => {
    media(true);
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    const more = screen.getByRole("button", { name: "More" });
    await user.click(more);
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(within(sheet).getByRole("link", { name: "Packages" })).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: "Policies" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("keeps the rail and no bottom bar on a wide screen", async () => {
    media(false);
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    expect(screen.getByRole("navigation", { name: "Places" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Project" })).toBeNull();
  });
});
