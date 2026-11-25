import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AgentFigure, WorkLaneSet } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { AgentCard } from "./AgentCard.js";
import { BayNamesProvider, bayModeWords, bayNamesFor, bayOf, plantLaneSet, plantNamesFor } from "./lanes.js";
import { OfficeView } from "./OfficeView.js";
import { PlantList } from "./PlantList.js";
import { saveMode } from "../../lib/mode.js";

/** The Plant's bays follow the project's work lanes: names, purposes and accessible names. The art and each figure's place do not move. */

afterEach(cleanup);

const lane = (id: string, name: string, purpose: string) => ({ id, name, purpose });
const SOFTWARE: WorkLaneSet = {
  preset: "software",
  default_lane: "platform",
  lanes: [
    lane("frontend", "Frontend", "User interface, browser code and styling"),
    lane("backend", "Backend", "Services, APIs and server logic"),
    lane("platform", "Platform", "Build, deploy, infrastructure and general engineering"),
    lane("data", "Data", "Schemas, migrations, storage and pipelines"),
    lane("tests", "Tests", "Automated tests, fixtures and quality checks"),
    lane("docs", "Docs", "Documentation, guides and decision records"),
  ],
};
const CAPITAL: WorkLaneSet = {
  preset: "capital-project",
  default_lane: "process",
  lanes: ["process", "mechanical", "electrical", "civil", "assurance", "project-controls"].map((id) => lane(id, id[0]!.toUpperCase() + id.slice(1).replace("-", " "), `${id} work`)),
};

const figure = (over: Partial<AgentFigure> = {}): AgentFigure => ({
  id: "R-1",
  package_id: "WP-0001",
  package_revision: 0,
  title: "Plant view labels",
  role: "author",
  state: "working",
  cause: "Drafting",
  since: new Date(Date.now() - 3600e3).toISOString(),
  place: "process",
  marks: { gate: false, safety: false },
  gate_stage: "in-work",
  data_lane: "internal",
  run_status: "running",
  href: { to: "/packages/$id", id: "WP-0001", hash: "runs" },
  ...over,
  cause_key: over.cause_key ?? `run:${over.id ?? "R-1"}`,
});

describe("bay names from work lanes", () => {
  it("puts lane i in bay i, and names a bay no lane stands in", () => {
    const names = bayNamesFor({ ...SOFTWARE, preset: "custom", lanes: SOFTWARE.lanes.slice(0, 2) });
    expect(names.process?.name).toBe("Frontend");
    expect(names.mechanical?.name).toBe("Backend");
    expect(names.electrical?.name).toBe("Spare bay");
    expect(bayNamesFor(undefined)).toEqual({});
    // Rooms are never renamed.
    expect(names.review).toBeUndefined();
  });

  it("follows the project with the most work on the floor, and falls back to the layout's names with none", () => {
    const f = (id: string, project_id: string) => figure({ id, project_id, lane: "x" });
    const sets = [{ project_id: "prj_a", work_lanes: CAPITAL }, { project_id: "prj_b", work_lanes: SOFTWARE }];
    expect(plantLaneSet([f("1", "prj_a"), f("2", "prj_b"), f("3", "prj_b")], sets)).toBe(SOFTWARE);
    expect(plantLaneSet([f("1", "prj_a"), f("2", "prj_b")], sets)).toBe(CAPITAL);
    expect(plantLaneSet([], undefined)).toBeUndefined();
  });
});

describe("the Plant with work lanes", () => {
  const floor = (lane_sets: unknown) =>
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ scrams: [] })),
      http.get("*/office/figures", () =>
        HttpResponse.json({
          figures: [
            figure({ project_id: "prj_s", lane: "frontend", lane_name: "Frontend" }),
            figure({ id: "R-2", package_id: "WP-0002", place: "electrical", lane: "platform", lane_name: "Platform", place_defaulted: true, href: { to: "/packages/$id", id: "WP-0002", hash: "runs" }, project_id: "prj_s" }),
          ],
          needs_me: 0,
          inbox_items: 0,
          hidden: 0,
          lane_sets,
          generated_at: new Date().toISOString(),
        }),
      ),
    );

  it("names the work bays after a Software project's lanes, in the drawing and for assistive technology", async () => {
    floor([{ project_id: "prj_s", work_lanes: SOFTWARE }]);
    await renderPage(<OfficeView />);
    expect(await screen.findByRole("region", { name: /^Frontend, Work bay: User interface, browser code and styling/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /^Platform, Work bay: Build, deploy, infrastructure and general engineering/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /^Docs, Work bay: Documentation/ })).toBeTruthy();
    // The six capital-project names are gone from the bays, and the seven rooms keep theirs.
    expect(screen.queryByRole("region", { name: /^Mechanical,/ })).toBeNull();
    expect(screen.queryByRole("region", { name: /^Process,/ })).toBeNull();
    expect(screen.getByRole("region", { name: /^Your office, Main control room:/ })).toBeTruthy();
  });

  it("keeps today's six names for a project with the capital-project preset, or an older server that sends no lanes", async () => {
    saveMode("capital-projects");
    floor(undefined);
    await renderPage(<OfficeView />);
    expect(await screen.findByRole("region", { name: /^Process, Work bay: Process design and simulation/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /^Project controls, Work bay:/ })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^Frontend,/ })).toBeNull();
  });

  it("follows the engineering mode when no project has chosen lanes", async () => {
    saveMode("software");
    floor(undefined);
    await renderPage(<OfficeView />);
    expect(await screen.findByRole("region", { name: /^Frontend, Work bay:/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /^Docs, Work bay:/ })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^Process,/ })).toBeNull();
    expect(screen.getByText(/Software lanes/)).toBeTruthy();
  });

  it("speaks the nuclear-grade words for the shared rooms, over the capital-project disciplines", () => {
    const names = plantNamesFor(undefined, "nuclear-grade");
    expect(bayOf(names, "process").name).toBe("Process");
    expect(bayOf(names, "assurance").name).toBe("QA");
    expect(bayOf(names, "verification").name).toBe("Independent verification");
    expect(bayModeWords(undefined, "nuclear-grade")).toBe("Nuclear grade");
  });

  it("lets a project's own lanes win over the mode for the bays, and keeps the mode's room words", () => {
    const names = plantNamesFor(SOFTWARE, "capital-projects");
    expect(bayOf(names, "process").name).toBe("Frontend");
    expect(bayOf(names, "verification").name).toBe("Verification");
    expect(bayOf(plantNamesFor(SOFTWARE, "software"), "verification").name).toBe("CI and checks");
  });

  it("names the bay on the list and the card, and the lane when it differs from the bay", async () => {
    const figs = [figure({ lane: "frontend", lane_name: "Frontend", project_id: "prj_s" }), figure({ id: "R-3", package_id: "WP-0003", place: "mechanical", lane: "backend", lane_name: "Backend", project_id: "prj_s" })];
    render(
      <BayNamesProvider value={bayNamesFor(SOFTWARE)}>
        <PlantList figures={figs} layout={undefined} labels={{ process: { label: "Work bay" }, mechanical: { label: "Work bay" } }} selected={undefined} onSelect={() => undefined} />
      </BayNamesProvider>,
    );
    expect(screen.getByText("Frontend, Work bay")).toBeTruthy();
    expect(screen.getByText("Backend, Work bay")).toBeTruthy();
    cleanup();
    // Another project's work on this Plant: the bay is named by the Plant, the card by its own lane.
    await renderPage(
      <BayNamesProvider value={bayNamesFor(CAPITAL)}>
        <AgentCard figure={figure({ place: "process", lane: "frontend", lane_name: "Frontend", project_id: "prj_s" })} lens={undefined} />
      </BayNamesProvider>,
    );
    expect(screen.getByText(/Process \(this project's Frontend lane\)/)).toBeTruthy();
  });

  it("says in words why work stands in the general lane", async () => {
    await renderPage(
      <BayNamesProvider value={bayNamesFor(SOFTWARE)}>
        <AgentCard figure={figure({ place: "electrical", lane: "platform", lane_name: "Platform", place_defaulted: true })} lens={undefined} />
      </BayNamesProvider>,
    );
    expect(screen.getByText(/Platform: shown here because no lane tag, repository path or discipline word places the work/)).toBeTruthy();
    void userEvent;
  });
});
