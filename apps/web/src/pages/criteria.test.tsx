import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { pkg } from "../test/fixtures.js";
import { Criteria } from "./PackagePage.js";

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

  it("offers no edit without a tag", async () => {
    await renderPage(<Criteria pkg={draft} enrolled={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
