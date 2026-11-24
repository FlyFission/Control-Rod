import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render.js";
import { FirstRunGuide, type GuideState, guideOpen, guideSteps } from "./FirstRunGuide.js";

const none: GuideState = { agentReady: false, hasRepoProject: false, hasCard: false, released: false, accepted: false };

describe("guideSteps", () => {
  it("lists the five steps from agents to an accepted change, ticked from state", () => {
    const steps = guideSteps({ ...none, agentReady: true, hasRepoProject: true });
    expect(steps.map((s) => s.id)).toEqual(["agents", "project", "card", "release", "accept"]);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["agents", "project"]);
  });
  it("closes once a change is accepted or the person hides it", () => {
    const all = { agentReady: true, hasRepoProject: true, hasCard: true, released: true, accepted: true };
    expect(guideOpen(all, false)).toBe(false);
    expect(guideOpen(none, true)).toBe(false);
    expect(guideOpen(none, false)).toBe(true);
  });
});

describe("FirstRunGuide", () => {
  it("offers one primary button, for the next step only", async () => {
    await renderPage(<FirstRunGuide state={none} mode="software" onNewChange={() => {}} onHide={() => {}} />);
    expect(screen.getByRole("heading", { name: "Get your first change done" })).toBeTruthy();
    expect(screen.getByText(/0 of 5 done/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose agents" }).getAttribute("href")).toBe("/setup");
    expect(screen.queryByRole("button", { name: "Describe a change" })).toBeNull();
  });
  it("asks for a change once agents and a repository are set, and opens the new-change box", async () => {
    const onNewChange = vi.fn();
    await renderPage(<FirstRunGuide state={{ ...none, agentReady: true, hasRepoProject: true }} mode="software" onNewChange={onNewChange} onHide={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Describe a change" }));
    expect(onNewChange).toHaveBeenCalledOnce();
    expect(screen.getByText(/2 of 5 done/)).toBeTruthy();
  });
  it("opens the waiting card for the release step", async () => {
    const onOpenCard = vi.fn();
    await renderPage(<FirstRunGuide state={{ ...none, agentReady: true, hasRepoProject: true, hasCard: true }} mode="software" onNewChange={() => {}} onOpenCard={onOpenCard} onHide={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the plan" }));
    expect(onOpenCard).toHaveBeenCalledOnce();
  });
  it("can be hidden", async () => {
    const onHide = vi.fn();
    await renderPage(<FirstRunGuide state={none} mode="software" onNewChange={() => {}} onHide={onHide} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide guide" }));
    expect(onHide).toHaveBeenCalledOnce();
  });
});
