import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { SignIn } from "./SignIn.js";

/**
 * A sign-in page drawn from an out-of-date session (a second tab, or a page restored with Back)
 * must not show a refusal meant for adding a passkey to someone else's account.
 */
const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({ created: true }) };
const firstRun = { registered: false, signed_in: false } as never;

describe("a sign-in page drawn from an out-of-date session", () => {
  it("takes a browser that is already signed in to its session instead of refusing", async () => {
    server.use(
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "own-account-only", message: "You can add a passkey only to your own account; an administrator invites new people" }, { status: 403 })),
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    );
    const user = userEvent.setup();
    const { qc } = await renderPage(<SignIn session={firstRun} passkeys={passkeys} />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await waitFor(() => expect(qc.getQueryData(["session"])).toMatchObject({ signed_in: true, user: "ben" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks a browser that is not signed in to sign in once the machine is already set up", async () => {
    server.use(
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "forbidden", message: "A passkey exists; sign in to add another, or use an invitation" }, { status: 403 })),
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: false })),
    );
    const user = userEvent.setup();
    const { qc } = await renderPage(<SignIn session={firstRun} passkeys={passkeys} />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This machine is already set up. Sign in with your passkey."));
    expect(qc.getQueryData(["session"])).toMatchObject({ registered: true, signed_in: false });
  });

  it("still shows a refusal that has nothing to do with a stale page", async () => {
    server.use(
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "registration-refused", message: "This authenticator is not allowed" }, { status: 403 })),
    );
    const user = userEvent.setup();
    await renderPage(<SignIn session={firstRun} passkeys={passkeys} />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This authenticator is not allowed"));
  });
});
