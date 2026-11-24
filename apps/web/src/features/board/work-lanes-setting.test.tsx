import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkLaneSet } from "../../api/types.js";
import { MAX_LANES, WorkLanesSetting, choiceOf, laneId } from "./WorkLanesSetting.js";

afterEach(cleanup);

const software: WorkLaneSet = { preset: "software", default_lane: "platform", lanes: [{ id: "platform", name: "Platform", purpose: "x" }] };

const open = async (current: WorkLaneSet | undefined, onSave = vi.fn()) => {
  const user = userEvent.setup();
  render(<WorkLanesSetting current={current} pending={false} onSave={onSave} />);
  await user.click(screen.getByText(/Plant bays:/));
  return { user, onSave };
};

describe("Plant bays setting", () => {
  it("says which preset the project uses, reading no lanes as Capital project", () => {
    render(<WorkLanesSetting current={software} pending={false} onSave={() => undefined} />);
    expect(screen.getByLabelText("Plant bays: Software. Change.")).toBeTruthy();
    cleanup();
    render(<WorkLanesSetting current={undefined} pending={false} onSave={() => undefined} />);
    expect(screen.getByLabelText("Plant bays: Capital project. Change.")).toBeTruthy();
  });

  it("saves a preset choice as the preset alone", async () => {
    const { user, onSave } = await open(undefined);
    await user.selectOptions(screen.getByRole("combobox", { name: "Bay names follow" }), "software");
    expect(screen.getByText(/Frontend, Backend, Platform, Data, Tests, Docs/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Plant bays" }));
    expect(onSave).toHaveBeenCalledWith({ preset: "software" });
  });

  it("edits custom lanes, with paths and keywords, and offers no seventh", async () => {
    const { user, onSave } = await open(undefined);
    await user.selectOptions(screen.getByRole("combobox", { name: "Bay names follow" }), "custom");
    await user.type(screen.getByRole("textbox", { name: "Lane 1 name" }), "Storefront");
    await user.type(screen.getByRole("textbox", { name: "Lane 1 purpose" }), "The shop");
    await user.type(screen.getByRole("textbox", { name: "Lane 1 repository paths" }), "site/, shop/");
    await user.type(screen.getByRole("textbox", { name: "Lane 1 keywords" }), "checkout");
    for (let i = 2; i <= MAX_LANES; i++) {
      await user.click(screen.getByRole("button", { name: "Add lane" }));
      await user.type(screen.getByRole("textbox", { name: `Lane ${i} name` }), `Lane ${i}`);
    }
    expect((screen.getByRole("button", { name: "Add lane" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/The Plant has 6 work bays, so 6 lanes is the most/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Plant bays" }));
    const sent = onSave.mock.calls[0]![0];
    expect(sent.preset).toBe("custom");
    expect(sent.lanes).toHaveLength(6);
    expect(sent.lanes[0]).toEqual({ id: "storefront", name: "Storefront", purpose: "The shop", keywords: ["checkout"], paths: ["site/", "shop/"] });
  });

  it("says what is wrong instead of sending", async () => {
    const { user, onSave } = await open(undefined);
    await user.selectOptions(screen.getByRole("combobox", { name: "Bay names follow" }), "custom");
    await user.click(screen.getByRole("button", { name: "Save Plant bays" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Name at least one lane.");
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("lane choices", () => {
  const row = (name: string, extra = {}) => ({ id: "", name, purpose: "", paths: "", keywords: "", ...extra });
  it("makes unique ids from names, keeping the id a lane already had", () => {
    expect(laneId("Front End!", [])).toBe("front-end");
    expect(laneId("Front End", ["front-end"])).toBe("front-end-2");
    expect(laneId("2nd line", [])).toBe("lane-2nd-line");
    const r = choiceOf("custom", [row("Web", { id: "kept-id" }), row("Web 2")]);
    expect("choice" in r && r.choice.lanes!.map((l) => l.id)).toEqual(["kept-id", "web-2"]);
  });
  it("refuses seven lanes, repeated names and long names", () => {
    expect(choiceOf("custom", Array.from({ length: 7 }, (_, i) => row(`L${i}`)))).toHaveProperty("problem");
    expect(choiceOf("custom", [row("A"), row("a")])).toHaveProperty("problem");
    expect(choiceOf("custom", [row("x".repeat(25))])).toHaveProperty("problem");
    expect(choiceOf("software", [])).toEqual({ choice: { preset: "software" } });
    // An edit keeps the configured default lane while it remains, and drops it once removed.
    const kept = choiceOf("custom", [row("Frontend", { id: "frontend" }), row("General", { id: "general" })], "general");
    expect(kept).toEqual({ choice: expect.objectContaining({ default_lane: "general" }) });
    const gone = choiceOf("custom", [row("Frontend", { id: "frontend" })], "general");
    expect("choice" in gone && gone.choice.default_lane).toBeFalsy();
  });
});
