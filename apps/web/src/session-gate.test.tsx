import { useState } from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "./test/server.js";
import { renderPage } from "./test/render.js";
import { SessionGate } from "./router.js";
import { sessionGeneration } from "./lib/session.js";

function workspaceProject(id: string, name: string) {
  return {
    id, name, mode: "software", status: "active", repo: "", repoStrategy: "worktree",
    workspaceRoot: "", lane: "internal",
    author: { ecosystem: "claude", model: "default", reasoning: "default" },
    checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    createdAt: "2026-11-22T00:00:00Z",
  };
}

/** A place holding component state, the way an editor holds a draft and its tag. */
function Draft() {
  const [text, setText] = useState("");
  return <input aria-label="Draft" value={text} onChange={(e) => setText(e.target.value)} />;
}

/**
 * The signed-in identity can change without this tab doing anything: another tab signs out and a
 * different person signs in, and this tab learns of it only when the session query refetches.
 */
describe("the session gate when the signed-in person changes behind it", () => {
  it("keeps cached projects and selection within the signed-in identity", async () => {
    let who = "ben";
    let failProjectLoad = false;
    const benProject = workspaceProject("prj_ben", "Ben project");
    const doraProject = workspaceProject("prj_dora", "Dora project");
    localStorage.setItem("cr.projects.v1", JSON.stringify([workspaceProject("prj_legacy", "Legacy project")]));
    localStorage.setItem("cr.active-project", "prj_legacy");
    server.use(
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: who })),
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/workspace/projects", () =>
        failProjectLoad ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(who === "ben" ? [benProject] : [doraProject]),
      ),
    );
    const { qc } = await renderPage(<SessionGate><Draft /></SessionGate>);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole("button", { name: "Ben project" }));
      expect(screen.getByRole("button", { name: "Ben project" }).getAttribute("aria-pressed")).toBe("true");

      who = "dora";
      failProjectLoad = true;
      await act(() => qc.invalidateQueries({ queryKey: ["session"] }));
      await screen.findByText("dora");
      expect(screen.queryByRole("button", { name: "Ben project" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Legacy project" })).toBeNull();
      expect(screen.getByRole("button", { name: "All Software" }).getAttribute("aria-pressed")).toBe("true");

      failProjectLoad = false;
      await act(() => qc.invalidateQueries({ queryKey: ["workspace-projects"] }));
      await user.click(await screen.findByRole("button", { name: "Dora project" }));

      who = "ben";
      failProjectLoad = true;
      await act(() => qc.invalidateQueries({ queryKey: ["session"] }));
      await screen.findByText("ben");
      expect(screen.queryByRole("button", { name: "Dora project" })).toBeNull();
      expect(screen.getByRole("button", { name: "Ben project" }).getAttribute("aria-pressed")).toBe("true");
    } finally {
      localStorage.clear();
    }
  });

  it("treats a refetched session for someone else as a new session: clears the earlier data and remounts the app", async () => {
    let who = "ben";
    server.use(
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: who })),
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    );
    const { qc } = await renderPage(
      <SessionGate>
        <Draft />
      </SessionGate>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "Draft" }), "Ben's unsaved draft");
    qc.setQueryData(["packages"], ["Ben's packages"]);
    const before = sessionGeneration();

    // Another tab signed Ben out and Dora in; this tab refetches the session (on focus or an invalidation).
    who = "dora";
    await act(() => qc.invalidateQueries({ queryKey: ["session"] }));

    await screen.findByText("dora");
    expect(sessionGeneration()).toBeGreaterThan(before);
    expect(qc.getQueryData(["packages"])).toBeUndefined();
    expect(screen.queryByDisplayValue("Ben's unsaved draft")).toBeNull();
    expect((screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value).toBe("");
  });

  it("treats a refetched sign-out as a new session too", async () => {
    let signedIn = true;
    server.use(
      http.get("*/auth/session", () => HttpResponse.json(signedIn ? { registered: true, signed_in: true, user: "ben" } : { registered: true, signed_in: false })),
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    );
    const { qc } = await renderPage(
      <SessionGate>
        <Draft />
      </SessionGate>,
    );
    await screen.findByRole("textbox", { name: "Draft" });
    qc.setQueryData(["packages"], ["Ben's packages"]);
    const before = sessionGeneration();
    signedIn = false;
    await act(() => qc.invalidateQueries({ queryKey: ["session"] }));
    await screen.findByRole("button", { name: "Sign in with passkey" });
    expect(sessionGeneration()).toBeGreaterThan(before);
    expect(qc.getQueryData(["packages"])).toBeUndefined();
  });

  it("keeps everything when a refetch returns the same person", async () => {
    server.use(
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    );
    const { qc } = await renderPage(
      <SessionGate>
        <Draft />
      </SessionGate>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "Draft" }), "Ben's unsaved draft");
    qc.setQueryData(["packages"], ["Ben's packages"]);
    const before = sessionGeneration();
    await act(() => qc.invalidateQueries({ queryKey: ["session"] }));
    await waitFor(() => expect(qc.getQueryState(["session"])?.fetchStatus).toBe("idle"));
    expect(sessionGeneration()).toBe(before);
    expect(qc.getQueryData(["packages"])).toEqual(["Ben's packages"]);
    expect(screen.getByDisplayValue("Ben's unsaved draft")).toBeTruthy();
  });
});
