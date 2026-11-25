import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { renderPage } from "../test/render.js";
import { server } from "../test/server.js";
import { ControlRodVersion, UpdateNotice } from "./UpdateNotice.js";

const running = { running_commit: "abcdef0123456789abcdef0123456789abcdef01" };

it("shows the update, copies the terminal command, and hides the notice after a current result", async () => {
  let checks = 0;
  server.use(
    http.get("*/update-notice", () => HttpResponse.json({ ...running, behind: 7 })),
    http.post("*/update-notice/check", () => {
      checks++;
      return HttpResponse.json({ ...running, behind: 0 });
    }),
  );
  const user = userEvent.setup();
  await renderPage(<UpdateNotice />);
  const notice = await screen.findByRole("region", { name: "Control Rod update" });
  expect(notice.textContent).toContain("A newer version of Control Rod is available (7 changes). Run controlrod update in a terminal.");
  expect(checks).toBe(0);
  await user.click(within(notice).getByRole("button", { name: "Copy" }));
  expect(await navigator.clipboard.readText()).toBe("controlrod update");
  await user.click(within(notice).getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Control Rod update" })).toBeNull());
  expect(checks).toBe(1);
});

it("shows the running commit in Setup and reports an offline result only there at startup", async () => {
  const offline = { ...running, error: "Could not check for updates." };
  server.use(
    http.get("*/update-notice", () => HttpResponse.json(offline)),
    http.post("*/update-notice/check", () => HttpResponse.json({ ...running, behind: 1 })),
  );
  const user = userEvent.setup();
  await renderPage(<><UpdateNotice /><ControlRodVersion /></>);
  const version = await screen.findByRole("region", { name: "Control Rod version" });
  expect(version.textContent).toContain("Running version: abcdef0");
  expect(within(version).getByRole("status").textContent).toBe(offline.error);
  expect(screen.queryByRole("region", { name: "Control Rod update" })).toBeNull();
  await user.click(within(version).getByRole("button", { name: "Check again" }));
  expect((await screen.findByRole("region", { name: "Control Rod update" })).textContent).toContain("(1 change)");
  expect(within(version).getByRole("status").textContent).toBe("");
});

it("asks for a restart, not an update, when the checkout is already newer than what is running", async () => {
  const latest = "1234567890abcdef1234567890abcdef12345678";
  server.use(http.get("*/update-notice", () => HttpResponse.json({ ...running, latest_commit: latest, checkout_commit: latest, behind: 3 })));
  const user = userEvent.setup();
  await renderPage(<UpdateNotice />);
  const notice = await screen.findByRole("region", { name: "Control Rod update" });
  expect(notice.textContent).toContain("still the older version (3 changes behind). Run controlrod stop && controlrod start in a terminal");
  await user.click(within(notice).getByRole("button", { name: "Copy" }));
  expect(await navigator.clipboard.readText()).toBe("controlrod stop && controlrod start");
});
