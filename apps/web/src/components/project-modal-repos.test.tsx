import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { ProjectModal } from "./ProjectModal.js";

/** RUN-4: the project form says where local clones are looked for, and finds a repository elsewhere. */

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const clone = (name: string, path: string) => ({ name, path, branch: "main", remote_url: null, dirty: false });

function repos() {
  const asked: string[] = [];
  server.use(
    http.get("*/repos", ({ request }) => {
      const root = new URL(request.url).searchParams.get("workspace_root");
      asked.push(root ?? "");
      if (root === null) return HttpResponse.json({ workspace_root: "/home/u/projects", local: [], github: [], github_error: null });
      if (root === "~/Code") return HttpResponse.json({ workspace_root: "/home/u/Code", local: [clone("site", "/home/u/Code/site")], github: [], github_error: null });
      if (root === "~/.ssh") return HttpResponse.json({ code: "invalid-workspace-root", message: "Workspace root cannot point to a hidden dot-folder under home." }, { status: 400 });
      return HttpResponse.json({ workspace_root: root, local: [], github: [], github_error: null });
    }),
    http.get("*/subscriptions", () => HttpResponse.json({ reported: true, platform: "linux", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] })),
  );
  return asked;
}

describe("the project form's local repositories", () => {
  it("says where it looks, and that CONTROLROD_WORKSPACE_ROOT changes it", async () => {
    repos();
    await renderPage(<ProjectModal open defaultMode="software" onClose={() => {}} />);
    expect(await screen.findByText(/Local clones are listed from \/home\/u\/projects: the folder CONTROLROD_WORKSPACE_ROOT named/)).toBeTruthy();
  });

  it("finds a repository from its own path and makes it the default", async () => {
    const user = userEvent.setup();
    const asked = repos();
    await renderPage(<ProjectModal open defaultMode="software" onClose={() => {}} />);
    await user.type(await screen.findByRole("textbox", { name: "Folder or repository path" }), "~/Code/site/");
    await user.click(screen.getByRole("button", { name: "Look here" }));
    expect(await screen.findByText("Found site in /home/u/Code. It is now the default repository.")).toBeTruthy();
    expect(asked).toContain("~/Code/site");
    expect(asked).toContain("~/Code");
    expect((screen.getByRole("combobox", { name: /Default repository/ }) as HTMLSelectElement).value).toBe("site");
  });

  it("says plainly when no repository is there, and shows the server's refusal of a hidden folder", async () => {
    const user = userEvent.setup();
    repos();
    await renderPage(<ProjectModal open defaultMode="software" onClose={() => {}} />);
    const box = await screen.findByRole("textbox", { name: "Folder or repository path" });
    await user.type(box, "~/Elsewhere/nothing");
    await user.click(screen.getByRole("button", { name: "Look here" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^No git repository found at ~\/Elsewhere\/nothing\./);
    await user.clear(box);
    await user.type(box, "~/.ssh");
    await user.click(screen.getByRole("button", { name: "Look here" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/hidden dot-folder/);
  });

  it("offers Antigravity and Grok as macOS only on Linux (RUN-3)", async () => {
    repos();
    await renderPage(<ProjectModal open defaultMode="software" onClose={() => {}} />);
    const author = (await screen.findAllByRole("combobox")).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "grok")) as HTMLSelectElement;
    const grok = Array.from(author.options).find((o) => o.value === "grok")!;
    await waitFor(() => expect(grok.disabled).toBe(true));
    expect(grok.textContent).toContain("macOS only");
    expect(Array.from(author.options).find((o) => o.value === "claude")!.disabled).toBe(false);
  });
});
