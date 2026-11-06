import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view, DIGEST } from "../../test/fixtures.js";
import { Preparation } from "../../pages/PackagePage.js";
import { PreparationPanel } from "./PreparationPanel.js";
import { adoptSession } from "../../lib/session.js";
import type { Session } from "../../api/types.js";
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

  it("never carries one package's unsaved draft to another package", async () => {
    const forPkg = (id: string, problem: string) => {
      const v = fixture();
      v.snapshot.package_id = id;
      v.snapshot.context.problem = problem;
      return v;
    };
    server.use(
      http.get("*/packages/:id/preparation", ({ params }) =>
        HttpResponse.json(params["id"] === "WP-B" ? forPkg("WP-B", "Need of B") : forPkg("WP-A", "Need of A")),
      ),
    );
    let show: (id: string) => void = () => undefined;
    function Switcher() {
      const [id, setId] = useState("WP-A");
      show = setId;
      return <Preparation pkg={pkg({ id })} view={view({ preparation_enabled: true, preparation_enrolled: true })} />;
    }
    await renderPage(<Switcher />);
    const user = userEvent.setup();
    const problem = (await screen.findByRole("textbox", { name: "Problem or need" })) as HTMLTextAreaElement;
    await waitFor(() => expect(problem.value).toBe("Need of A"));
    await user.type(problem, " unsaved");
    act(() => show("WP-B"));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Problem or need" }) as HTMLTextAreaElement).value).toBe("Need of B"));
  });

  it("keeps a new line in every one-per-line list", async () => {
    server.use(http.get("*/packages/:id/preparation", () => HttpResponse.json(fixture())));
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    for (const name of ["Alternatives considered (one per line)", "Risks and holds (one per line)"]) {
      const box = (await screen.findByRole("textbox", { name })) as HTMLTextAreaElement;
      await user.type(box, "First{Enter}");
      expect(box.value).toBe("First\n");
    }
  });

  it("retires a verification check and every criterion's pointer to it", async () => {
    const current = fixture();
    current.snapshot.technical_plan.checks = [{ id: "K1", criterion_ids: ["C1"], method: "Review", required: true, expected_result: "Pass" }];
    current.snapshot.criteria[0]!.verification_check_ids = ["K1"];
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
    await user.click(await screen.findByRole("button", { name: "Retire check 1" }));
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(saved?.technical_plan.checks).toEqual([]));
    expect(saved?.criteria[0].verification_check_ids).toEqual([]);
  });

  it("keeps a criterion a resolved escalation rests on, and says why", async () => {
    const current = fixture();
    current.snapshot.escalations = [{ id: "E1", criterion_ids: ["C1"], reason: "Unclear", alternatives: [], owner: "owner", resolution_refs: ["RES-1"] }];
    server.use(http.get("*/packages/:id/preparation", () => HttpResponse.json(current)));
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const retire = (await screen.findByRole("button", { name: "Retire criterion 1" })) as HTMLButtonElement;
    expect(retire.disabled).toBe(true);
    expect(screen.getByText(/A resolved escalation rests on this criterion/)).toBeTruthy();
  });
  /** A later session: the answer to a request begun under the earlier one must not reach its cache. */
  const nextSession = { registered: true, signed_in: true, user: "dora" } as Session;

  it("a save that finishes after a new session began leaves that session's cache without it", async () => {
    const current = fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let started!: () => void;
    const putStarted = new Promise<void>((r) => { started = r; });
    let hangLoads = false;
    server.use(
      http.get("*/packages/:id/preparation", async () => {
        // After the new session begins, its own load never answers, so only a late write could fill the cache.
        if (hangLoads) await new Promise(() => undefined);
        return HttpResponse.json(current);
      }),
      http.put("*/packages/:id/preparation", async () => {
        started();
        await gate;
        return HttpResponse.json({ ...current, snapshot: { ...current.snapshot, revision: 9 } });
      }),
    );
    const { qc } = await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const problem = await screen.findByRole("textbox", { name: "Problem or need" });
    await user.clear(problem);
    await user.type(problem, "Earlier person's text");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await putStarted;
    hangLoads = true;
    await act(() => adoptSession(qc, nextSession));
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(qc.getQueryData(["preparation", pkg().id])).toBeUndefined();
  });

  it("a reload that finishes after a new session began leaves that session's cache without it", async () => {
    const current = fixture();
    let hold = false;
    let afterReload = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let started!: () => void;
    const getStarted = new Promise<void>((r) => { started = r; });
    server.use(
      http.get("*/packages/:id/preparation", async () => {
        if (hold) {
          hold = false;
          started();
          await gate;
          return HttpResponse.json({ ...current, snapshot: { ...current.snapshot, revision: 7 } });
        }
        // After the held reload, the new session's own load never answers, so only a late write could fill the cache.
        if (afterReload) await new Promise(() => undefined);
        return HttpResponse.json(current);
      }),
    );
    const { qc } = await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "Problem or need" });
    hold = true;
    await user.click(screen.getByRole("button", { name: "Reload saved preparation" }));
    await getStarted;
    afterReload = true;
    await act(() => adoptSession(qc, nextSession));
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(qc.getQueryData(["preparation", pkg().id])).toBeUndefined();
  });

  /**
   * The editor itself, not only the cache: a panel that stays mounted across a change of who is
   * signed in must not show, or take an ETag from, an answer about the earlier person. In the app
   * the session gate remounts the panel; these tests keep it mounted to check the panel's own guard.
   */
  function heldOnce() {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let started!: () => void;
    const begun = new Promise<void>((r) => { started = r; });
    return { release, gate, started, begun };
  }
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  const earlier = (problem: string, revision: number) => {
    const c = fixture();
    return { ...c, snapshot: { ...c.snapshot, revision, context: { ...c.snapshot.context, problem } } };
  };

  /**
   * Renders the panel, runs `start` (which sends the held request), then begins a new session while
   * that request is held. Clearing the cache would otherwise park the panel on "Loading", hiding the
   * editor whatever its state holds; putting the same view back, with later loads never answering,
   * keeps the editor on screen so only the late answer could change it.
   */
  async function acrossNewSession(held: ReturnType<typeof heldOnce>, start: (user: ReturnType<typeof userEvent.setup>) => Promise<void>, gate: { loads: boolean }) {
    const { qc } = await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "Problem or need" });
    await start(user);
    await held.begun;
    const shown = qc.getQueryData(["preparation", pkg().id]);
    gate.loads = false;
    await act(() => adoptSession(qc, nextSession));
    qc.setQueryData(["preparation", pkg().id], shown);
    held.release();
    await settle();
    return qc;
  }

  it("a basis refresh answered after a new session began does not appear in the editor", async () => {
    const held = heldOnce();
    const gate = { loads: true };
    server.use(
      http.get("*/packages/:id/preparation", async () => (gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined))),
      http.post("*/packages/:id/preparation/basis/refresh", async () => {
        held.started();
        await held.gate;
        return HttpResponse.json(earlier("Refreshed for the earlier person", 9));
      }),
    );
    await acrossNewSession(held, (user) => user.click(screen.getByRole("button", { name: "Refresh declared input pins" })), gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Refreshed for the earlier person")).toBeNull();
  });

  it("a refusal answered after a new session began is not shown", async () => {
    const held = heldOnce();
    const gate = { loads: true };
    server.use(
      http.get("*/packages/:id/preparation", async () => (gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined))),
      http.put("*/packages/:id/preparation", async () => {
        held.started();
        await held.gate;
        return HttpResponse.json({ code: "stale", message: "Preparation changed. Reload and compare." }, { status: 409 });
      }),
    );
    await acrossNewSession(held, async (user) => {
      await user.type(screen.getByRole("textbox", { name: "Problem or need" }), " edited");
      await user.click(screen.getByRole("button", { name: "Save preparation" }));
    }, gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByText("Preparation changed. Reload and compare.")).toBeNull();
  });

  it("a comparison read answered after a new session began is not shown", async () => {
    const held = heldOnce();
    const gate = { loads: true, hold: false };
    server.use(
      http.get("*/packages/:id/preparation", async () => {
        if (gate.hold) {
          gate.hold = false;
          held.started();
          await held.gate;
          return HttpResponse.json(earlier("Compared for the earlier person", 4));
        }
        return gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined);
      }),
      http.put("*/packages/:id/preparation", () =>
        HttpResponse.json({ code: "stale", message: "Preparation changed. Reload and compare." }, { status: 409 })),
    );
    await acrossNewSession(held, async (user) => {
      await user.type(screen.getByRole("textbox", { name: "Problem or need" }), " edited");
      gate.hold = true;
      await user.click(screen.getByRole("button", { name: "Save preparation" }));
    }, gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByText(/Compared for the earlier person/)).toBeNull();
  });

  it("a reload answered after a new session began does not appear in the editor", async () => {
    const held = heldOnce();
    const gate = { loads: true, hold: false };
    server.use(
      http.get("*/packages/:id/preparation", async () => {
        if (gate.hold) {
          gate.hold = false;
          held.started();
          await held.gate;
          return HttpResponse.json(earlier("Reloaded for the earlier person", 7));
        }
        return gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined);
      }),
    );
    await acrossNewSession(held, async (user) => {
      gate.hold = true;
      await user.click(screen.getByRole("button", { name: "Reload saved preparation" }));
    }, gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Reloaded for the earlier person")).toBeNull();
  });

  it("history answered after a new session began is not shown", async () => {
    const held = heldOnce();
    const gate = { loads: true };
    server.use(
      http.get("*/packages/:id/preparation", async () => (gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined))),
      http.get("*/packages/:id/preparation/history", async () => {
        held.started();
        await held.gate;
        return HttpResponse.json({ revisions: [earlier("History of the earlier person", 3)] });
      }),
    );
    await acrossNewSession(held, (user) => user.click(screen.getByRole("button", { name: "Show preparation history" })), gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByText("History of the earlier person")).toBeNull();
  });

  it("a reload refused after a new session began shows no refusal", async () => {
    const held = heldOnce();
    const gate = { loads: true, hold: false };
    server.use(
      http.get("*/packages/:id/preparation", async () => {
        if (gate.hold) {
          gate.hold = false;
          held.started();
          await held.gate;
          return HttpResponse.json({ code: "unavailable", message: "Reload refused for the earlier person" }, { status: 503 });
        }
        return gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined);
      }),
    );
    await acrossNewSession(held, async (user) => {
      gate.hold = true;
      await user.click(screen.getByRole("button", { name: "Reload saved preparation" }));
    }, gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByText("Reload refused for the earlier person")).toBeNull();
  });

  it("history refused after a new session began shows no refusal", async () => {
    const held = heldOnce();
    const gate = { loads: true };
    server.use(
      http.get("*/packages/:id/preparation", async () => (gate.loads ? HttpResponse.json(fixture()) : new Promise<never>(() => undefined))),
      http.get("*/packages/:id/preparation/history", async () => {
        held.started();
        await held.gate;
        return HttpResponse.json({ code: "unavailable", message: "History refused for the earlier person" }, { status: 503 });
      }),
    );
    await acrossNewSession(held, (user) => user.click(screen.getByRole("button", { name: "Show preparation history" })), gate);
    expect(screen.getByRole("textbox", { name: "Problem or need" })).toBeTruthy();
    expect(screen.queryByText("History refused for the earlier person")).toBeNull();
  });
});
