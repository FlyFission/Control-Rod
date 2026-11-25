/** A branch name from what the card asks for: cr/<words>. */
export function suggestBranchName(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return slug ? `cr/${slug}` : "cr/work-package";
}

/** A branch of its own for one quick-added card, so two cards with the same words never share one. */
export function cardBranchName(text: string, rand: () => number = Math.random): string {
  const tag = Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0");
  return `${suggestBranchName(text)}-${tag}`;
}
