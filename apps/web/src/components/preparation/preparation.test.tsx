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
});
