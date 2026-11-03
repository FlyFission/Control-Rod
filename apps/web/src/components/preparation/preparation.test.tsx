import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, DIGEST } from "../../test/fixtures.js";
import { PreparationPanel } from "./PreparationPanel.js";
import { preparationViewFixture as fixture } from "./test-fixtures.js";
describe("manual preparation workbench", () => {
  it("shows stored context, requirement status and blocker ownership; saves with the loaded ETag", async () => {
    const current = fixture();
    let saved: unknown;
    let match: string | null = null;
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", async ({ request }) => {
        saved = await request.json();
        match = request.headers.get("if-match");
        return HttpResponse.json({
          ...current,
          snapshot: { ...current.snapshot, revision: 1 },
        });
      }),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const problem = await screen.findByRole("textbox", {
      name: "Problem or need",
    });
    expect((problem as HTMLTextAreaElement).value).toBe("Saved need");
    expect(screen.getByText(/Requester.*Supply input/)).toBeTruthy();
    expect(screen.getByText(/Requirements not confirmed/)).toBeTruthy();
    await user.clear(problem);
    await user.type(problem, "Updated need");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() =>
      expect(saved).toMatchObject({ context: { problem: "Updated need" } }),
    );
    expect(match).toBe(`"${DIGEST.value}"`);
  });
  it("keeps unsaved work on conflict and offers explicit reload instead of merging", async () => {
    const current = fixture();
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", () =>
        HttpResponse.json(
          {
            code: "stale",
            message: "Preparation changed. Reload and compare.",
          },
          { status: 409 },
        ),
      ),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const problem = await screen.findByRole("textbox", {
      name: "Problem or need",
    });
    await user.clear(problem);
    await user.type(problem, "Keep local work");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Preparation changed",
    );
    expect((problem as HTMLTextAreaElement).value).toBe("Keep local work");
    expect(
      screen.getByRole("button", { name: "Reload saved preparation" }),
    ).toBeTruthy();
  });
  it("enrollment is explicit and absent when disabled", async () => {
    const rendered = await renderPage(
      <PreparationPanel pkg={pkg()} enabled={false} enrolled={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "Start guided preparation" }),
    ).toBeNull();
    rendered.unmount();
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled={false} />);
    expect(
      screen.getByRole("button", { name: "Start guided preparation" }),
    ).toBeTruthy();
  });
  it("signs displayed requirements as a separate action and reloads the stored confirmation", async () => {
    const current = fixture();
    let confirmed = false;
    let signed = 0;
    server.use(
      http.get("*/packages/:id/preparation", () =>
        HttpResponse.json({ ...current, confirmed }),
      ),
      http.post("*/packages/:id/preparation/confirm/options", () =>
        HttpResponse.json({
          requirements_digest: DIGEST,
          options: { challenge: "requirements-only" },
        }),
      ),
      http.post("*/packages/:id/preparation/confirm", () => {
        confirmed = true;
        return HttpResponse.json({ id: "CONF-1" }, { status: 201 });
      }),
    );
    await renderPage(
      <PreparationPanel
        pkg={pkg()}
        enabled
        enrolled
        passkeys={{
          get: async (options) => {
            expect(options.challenge).toBe("requirements-only");
            signed++;
            return { id: "signed" };
          },
          create: async () => ({}),
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Confirm requirements with passkey",
      }),
    );
    await screen.findByText(/Requirements confirmed/);
    expect(signed).toBe(1);
  });
  it("refreshes declared inputs explicitly with the loaded ETag before signing", async () => {
    const current = fixture();
    let match: string | null = null;
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.post("*/packages/:id/preparation/basis/refresh", ({ request }) => {
        match = request.headers.get("if-match");
        return HttpResponse.json(current);
      }),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Refresh declared input pins",
      }),
    );
    await waitFor(() => expect(match).toBe(`"${DIGEST.value}"`));
  });

  it("retiring an item retires every reference to it, so the saved preparation never cites a missing item", async () => {
    const current = fixture();
    current.snapshot.technical_plan.checks = [{ id: "K1", criterion_ids: ["C1"], method: "Review", required: true, expected_result: "Pass" }];
    current.snapshot.escalations = [{ id: "E1", criterion_ids: ["C1"], reason: "Unclear", alternatives: [], owner: "owner", resolution_refs: [] }];
    const saved: Record<string, any>[] = [];
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", async ({ request }) => {
        saved.push((await request.json()) as Record<string, any>);
        return HttpResponse.json(current);
      }),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retire requirement 1" }));
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.criteria[0].requirement_ids).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Retire criterion 1" }));
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]!.technical_plan.checks[0].criterion_ids).toEqual([]);
    expect(saved[1]!.escalations[0].criterion_ids).toEqual([]);
  });

  it("keeps a new line while typing a one-per-line list, and saves only the entries", async () => {
    const current = fixture();
    let saved: Record<string, any> | undefined;
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", async ({ request }) => {
        saved = (await request.json()) as Record<string, any>;
        return HttpResponse.json(current);
      }),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const sources = (await screen.findByRole("textbox", { name: "Controlled current-state sources (one reference per line)" })) as HTMLTextAreaElement;
    await user.type(sources, "DOC-1{Enter}");
    expect(sources.value).toBe("DOC-1\n");
    await user.type(sources, "  DOC-2  {Enter}{Enter}");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(saved?.technical_plan.current_state_refs).toEqual(["DOC-1", "DOC-2"]));
  });
});
