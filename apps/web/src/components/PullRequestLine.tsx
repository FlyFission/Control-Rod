import type { PackageView } from "../api/types.js";

/** The pull request in words, from what GitHub last said; as before when it has not been read. */
function openedWords(w: NonNullable<PackageView["pull_request"]>["watch"]): string {
  if (!w) return "Draft pull request opened";
  const at = new Date(w.read_at);
  const when = Number.isNaN(at.getTime()) ? "" : ` (checked ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
  if (w.state === "merged") return `Pull request merged${when}`;
  if (w.state === "closed") return `Pull request closed without merging${when}`;
  if (w.checks === "failing") return `Pull request open, checks failing${when}`;
  if (w.checks === "pending") return `Pull request open, checks running${when}`;
  if (w.checks === "passing") return `Pull request open, checks passing${when}`;
  return `Pull request open${when}`;
}

/** One line on where accepted work went: the draft pull request, or why there is none. */
export function PullRequestLine({ pr }: { pr: PackageView["pull_request"] }) {
  if (!pr) return null;
  if (pr.state === "opened" && pr.url) {
    return (
      <p className="pr-line small" role="status">
        {openedWords(pr.watch)}:{" "}
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
