import { describe, expect, it } from "vitest";
import { AGENTS, type AgentRow } from "../lib/agents.js";
import { renderPage } from "../test/render.js";
import { AgentList } from "./AgentList.js";

const rows: AgentRow[] = [{ info: AGENTS[0]!, seated: true, state: "ready", installed: true, status: "Ready." }];

describe("the seat-on animation", () => {
  it("plays once per seat in a session, not each time the table is shown again", async () => {
    const first = await renderPage(<AgentList rows={rows} onToggle={() => {}} lightUp />);
    expect(first.container.querySelector("li.seat[data-light]")).not.toBeNull();
    first.unmount();
    const again = await renderPage(<AgentList rows={rows} onToggle={() => {}} lightUp />);
    expect(again.container.querySelector("li.seat")).not.toBeNull();
    expect(again.container.querySelector("li.seat[data-light]")).toBeNull();
  });
});
