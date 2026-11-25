import type { PackageView } from "../api/types.js";

/** One line on where accepted work went: the draft pull request, or why there is none. */
export function PullRequestLine({ pr }: { pr: PackageView["pull_request"] }) {
  if (!pr) return null;
  if (pr.state === "opened" && pr.url) {
    return (
      <p className="pr-line small" role="status">
        Draft pull request opened:{" "}
        <a href={pr.url} target="_blank" rel="noreferrer">
          {pr.url.replace(/^https:\/\/github\.com\//, "")}
        </a>
      </p>
    );
  }
  if (pr.state === "opening") return <p className="pr-line small muted" role="status">Opening a draft pull request from {pr.branch}…</p>;
  if (pr.state === "no-changes") return <p className="pr-line small muted" role="status">No pull request: the work changed no files in the repository.</p>;
  return (
    <p className="pr-line small error" role="status">
      The pull request was not opened. {pr.detail}
    </p>
  );
}
