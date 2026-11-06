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
