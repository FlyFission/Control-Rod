import { describe, expect, it } from "vitest";
import { githubListError } from "../src/repos.js";

describe("githubListError", () => {
  it("says gh is missing, with where to get it", () => {
    const msg = githubListError(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }));
    expect(msg).toContain("isn't installed");
    expect(msg).toContain("https://cli.github.com");
  });

  it("says gh is not signed in, with the command", () => {
    const err = Object.assign(new Error("Command failed: gh repo list"), {
      code: 4,
      stderr: "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable.\n",
    });
    expect(githubListError(err)).toBe("GitHub repositories can't be listed because the GitHub CLI isn't signed in. Run gh auth login in a terminal, then open this again.");
  });

  it("says GitHub could not be reached when there is no network or gh timed out", () => {
    const offline = Object.assign(new Error("Command failed"), { code: 1, stderr: 'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n' });
    expect(githubListError(offline)).toContain("couldn't be reached");
    expect(githubListError(Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" }))).toContain("couldn't be reached");
  });

  it("keeps gh's own first line for anything else, after a plain lead", () => {
    const odd = Object.assign(new Error("Command failed: gh repo list --limit 40\nsomething odd happened\nmore"), { code: 1, stderr: "" });
    expect(githubListError(odd)).toBe("GitHub repositories can't be listed. The GitHub CLI said: something odd happened");
  });
});
