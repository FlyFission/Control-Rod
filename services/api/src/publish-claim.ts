import type { Db, Tx } from "./db/index.js";

/**
 * How long a pull request attempt's claim holds. The publisher sends nothing new once its claim
 * could have run out (PUBLISH_SEND_BY), and while a claim holds no marking may move the card off the
 * public and internal lanes: that is the lane barrier between a raise and a push already under way.
 */
export const PR_CLAIM_MS = 15 * 60_000;
/** The publisher's own cut-off inside the claim, leaving room for its last push and pull request. */
export const PUBLISH_SEND_BY_MS = PR_CLAIM_MS - 5 * 60_000;

/** Whether a pull request attempt for this package is under way: its latest attempt event is a claim still in time. */
export async function publishing(q: Db | Tx, packageId: string): Promise<boolean> {
  const last = (await q.query<{ type: string; at: string }>(
    `select body->>'type' as type, body->>'at' as at from events where body->>'subject' = $1
       and body->>'type' in ('package.pr-started', 'package.pr-opened', 'package.pr-not-opened') order by seq desc limit 1`, [packageId])).rows[0];
  return last?.type === "package.pr-started" && Date.now() - new Date(last.at).getTime() < PR_CLAIM_MS;
}
