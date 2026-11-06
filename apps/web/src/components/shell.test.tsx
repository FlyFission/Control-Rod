import { act } from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { adoptSession } from "../lib/session.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";

const ben = { registered: true, signed_in: true, user: "ben" } as Session;
const dora = { registered: true, signed_in: true, user: "dora" } as Session;

/** Holds the sign-out answer until the test releases it, counting how many requests were sent. */
function heldLogout() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let started!: () => void;
  const begun = new Promise<void>((r) => { started = r; });
  const sent = { count: 0 };
  server.use(
    http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    http.post("*/auth/logout", async () => {
      sent.count += 1;
      started();
      await gate;
      return HttpResponse.json({ registered: true, signed_in: false });
    }),
  );
  return { release, begun, sent };
}

describe("signing out", () => {
  it("cannot be sent twice while a sign-out is pending", async () => {
    const held = heldLogout();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement;
    await user.click(button);
    await held.begun;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(held.sent.count).toBe(1);
    held.release();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("an answer that arrives after a newer sign-in does not replace the newer session", async () => {
    const held = heldLogout();
    const { qc } = await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await held.begun;
    // The earlier sign-out finished elsewhere and Dora signed in before this answer came back.
    await act(() => adoptSession(qc, dora));
    held.release();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(qc.getQueryData(["session"])).toEqual(dora);
  });
});
