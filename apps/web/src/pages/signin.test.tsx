import { act } from "react";
import { describe, expect, it } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { SignIn } from "./SignIn.js";
import { adoptSession } from "../lib/session.js";

/**
 * A sign-in page drawn from an out-of-date session (a second tab, or a page restored with Back)
 * must not show a refusal meant for adding a passkey to someone else's account.
 */
const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({ created: true }) };
const firstRun = { registered: false, signed_in: false } as never;

/** A stand-in for Root in router.tsx (not Root itself): the session query decides between the sign-in page and the app. */
function Gate() {
  const s = useQuery({ queryKey: ["session"], queryFn: api.session });
  if (s.data === undefined) return null;
  return s.data.signed_in ? <p>The app</p> : <SignIn session={s.data} passkeys={passkeys} />;
}

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

  it("switches the real gate from a stale setup page to the app, dropping what the stale page loaded", async () => {
    let calls = 0;
    server.use(
      http.get("*/auth/session", () => HttpResponse.json(calls++ === 0 ? { registered: false, signed_in: false } : { registered: true, signed_in: true, user: "ben" })),
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "own-account-only", message: "You can add a passkey only to your own account" }, { status: 403 })),
    );
    const user = userEvent.setup();
    const { qc } = await renderPage(<Gate />);
    await screen.findByRole("heading", { name: "Set up this machine" });
    qc.setQueryData(["stale"], "loaded by the stale page");
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await screen.findByText("The app");
    expect(qc.getQueryData(["stale"])).toBeUndefined();
  });

  it("recovers when adding a passkey asks for a step-up the stale page never offered", async () => {
    server.use(
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "step-up-required", message: "Sign with a passkey you already hold to add another" }, { status: 403 })),
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: false })),
    );
    const user = userEvent.setup();
    await renderPage(<SignIn session={firstRun} passkeys={passkeys} />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This machine is already set up. Sign in with your passkey."));
  });

  it("sends a sign-in page whose machine was reset back to setup", async () => {
    server.use(
      http.post("*/auth/login/options", () => HttpResponse.json({ code: "not-registered", message: "Register a passkey first" }, { status: 409 })),
      http.get("*/auth/session", () => HttpResponse.json({ registered: false, signed_in: false })),
    );
    const user = userEvent.setup();
    const { qc } = await renderPage(<SignIn session={{ registered: true, signed_in: false } as never} passkeys={passkeys} />);
    await user.click(screen.getByRole("button", { name: "Sign in with passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Set up this machine to continue."));
    expect(qc.getQueryData(["session"])).toMatchObject({ registered: false });
  });

  it("redraws the app after a first registration ", async () => {
    let done = false;
    server.use(
      http.get("*/auth/session", () => HttpResponse.json(done ? { registered: true, signed_in: true, user: "ben" } : { registered: false, signed_in: false })),
      http.post("*/auth/register/options", () => HttpResponse.json({ options: { challenge: "c" } })),
      http.post("*/auth/register/verify", () => { done = true; return HttpResponse.json({ registered: true, signed_in: true, user: "ben" }); }),
    );
    const user = userEvent.setup();
    await renderPage(<Gate />);
    await screen.findByRole("heading", { name: "Set up this machine" });
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await screen.findByText("The app");
  });

  it("discards a recovery read that finishes after a newer session was adopted", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let started!: () => void;
    const readStarted = new Promise<void>((r) => { started = r; });
    server.use(
      http.post("*/auth/register/options", () =>
        HttpResponse.json({ code: "own-account-only", message: "You can add a passkey only to your own account" }, { status: 403 })),
      http.get("*/auth/session", async () => {
        started();
        await gate;
        return HttpResponse.json({ registered: true, signed_in: true, user: "ben" });
      }),
    );
    const user = userEvent.setup();
    const { qc } = await renderPage(<SignIn session={firstRun} passkeys={passkeys} />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ben");
    await user.click(screen.getByRole("button", { name: "Register passkey" }));
    await readStarted;
    await act(() => adoptSession(qc, { registered: true, signed_in: true, user: "dora" } as never));
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Register passkey" }).hasAttribute("disabled")).toBe(false));
    expect(qc.getQueryData(["session"])).toMatchObject({ user: "dora" });
  });
});
