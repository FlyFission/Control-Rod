import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { pkg, view } from "../test/fixtures.js";
import { Criteria } from "./PackagePage.js";
import { adoptSession } from "../lib/session.js";
import type { Session } from "../api/types.js";

/** Draft compare and swap in the criteria editor (workbench plan task 1.6). */
const draft = pkg({ status: "draft", acceptance_criteria: ["Loads within 5 percent"] });
const TAG = `"${"a".repeat(64)}"`;

/** Holds the page's package and tag the way a refresh would update them. */
let refresh: (next: { pkg: typeof draft; etag: string }) => void = () => undefined;
function Live() {
  const [state, setState] = useState({ pkg: draft, etag: TAG });
  refresh = setState;
  return <Criteria pkg={state.pkg} etag={state.etag} enrolled={false} />;
}

describe("criteria editor", () => {
  it("saves with the tag the draft had when editing began", async () => {
    let match: string | null = null;
    let body: { acceptance_criteria?: string[] } = {};
    server.use(http.put("*/packages/:id", async ({ request }) => {
      match = request.headers.get("if-match");
      body = (await request.json()) as typeof body;
      return HttpResponse.json({ ...draft, acceptance_criteria: body.acceptance_criteria });
    }));
    await renderPage(<Criteria pkg={draft} etag={TAG} enrolled={false} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Loads within 2 percent");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(match).toBe(TAG));
    expect(body.acceptance_criteria).toEqual(["Loads within 2 percent"]);
  });

  it("keeps what is being typed when a refresh arrives, and offers the latest on a stale save", async () => {
    server.use(http.put("*/packages/:id", () => HttpResponse.json({ code: "stale", message: "changed" }, { status: 409 })));
    await renderPage(<Live />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(box);
    await user.type(box, "My unsaved criterion");
    // Someone else saves; the page refreshes with new criteria and a new tag while this person types.
    const theirs = pkg({ status: "draft", acceptance_criteria: ["Their new criterion"] });
    await act(async () => refresh({ pkg: theirs, etag: `"${"b".repeat(64)}"` }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("My unsaved criterion");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changed since you started editing\. Your text is still here/)).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("My unsaved criterion");
    await user.click(screen.getByRole("button", { name: "Load the latest criteria" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Their new criterion");
  });

  it("after a save, the next edit uses the saved tag even when the reload fails", async () => {
    const saved = `"${"c".repeat(64)}"`;
    const seen: (string | null)[] = [];
    let gets = 0;
    server.use(
      http.get("*/packages/:id", () => {
        gets += 1;
        return gets === 1 ? HttpResponse.json(view({ draft_etag: TAG }, { status: "draft", acceptance_criteria: ["Loads within 5 percent"] }))
          : HttpResponse.json({ code: "error", message: "down" }, { status: 500 });
      }),
      http.put("*/packages/:id", async ({ request }) => {
        seen.push(request.headers.get("if-match"));
        const body = (await request.json()) as { acceptance_criteria: string[] };
        return HttpResponse.json({ ...draft, acceptance_criteria: body.acceptance_criteria }, { headers: { ETag: saved } });
      }),
    );
    function Page() {
      const q = useQuery({ queryKey: ["package", draft.id], queryFn: () => api.packageView(draft.id) });
      return q.data ? <Criteria pkg={q.data.package} etag={q.data.draft_etag} enrolled={false} /> : null;
    }
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "First save");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Second save");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(seen).toEqual([TAG, saved]));
  });

  it("offers no edit without a tag", async () => {
    await renderPage(<Criteria pkg={draft} enrolled={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("a save that finishes after a new session began leaves that session's cache without it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let started!: () => void;
    const putStarted = new Promise<void>((r) => { started = r; });
    server.use(http.put("*/packages/:id", async ({ request }) => {
      started();
      await gate;
      const body = (await request.json()) as { acceptance_criteria: string[] };
      return HttpResponse.json({ ...draft, acceptance_criteria: body.acceptance_criteria }, { headers: { ETag: `"${"d".repeat(64)}"` } });
    }));
    const { qc } = await renderPage(<Criteria pkg={draft} etag={TAG} enrolled={false} />);
    qc.setQueryData(["package", draft.id], view({ draft_etag: TAG }, { status: "draft" }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Earlier person's criterion");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await putStarted;
    await act(() => adoptSession(qc, { registered: true, signed_in: true, user: "dora" } as Session));
    // The new session has its own copy of the package; the late save must not overwrite it.
    const theirs = view({ draft_etag: `"${"e".repeat(64)}"` }, { status: "draft", acceptance_criteria: ["The new session's criterion"] });
    qc.setQueryData(["package", draft.id], theirs);
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(qc.getQueryData(["package", draft.id])).toEqual(theirs);
  });
});
