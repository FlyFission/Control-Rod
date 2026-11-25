import type { Db, Tx } from "./db/index.js";

/**
 * How long a pull request attempt's claim holds. The publisher sends nothing new once its claim
 * could have run out (PUBLISH_SEND_BY), and while a claim holds no marking may move the card off the
 * public and internal lanes: that is the lane barrier between a raise and a push already under way.
 */
export const PR_CLAIM_MS = 15 * 60_000;
/** The publisher's own cut-off inside the claim, leaving room for its last push and pull request. */
export const PUBLISH_SEND_BY_MS = PR_CLAIM_MS - 5 * 60_000;

/**
 * Whether a pull request attempt for this package may still be sending: a claim started within the
 * window that has no outcome of its own. Each claim carries an id and each outcome names the claim
 * it ends, so an older attempt finishing never releases a newer one's barrier.
 */
export async function publishing(q: Db | Tx, packageId: string): Promise<boolean> {
  const since = new Date(Date.now() - PR_CLAIM_MS).toISOString();
  const r = await q.query(
    `select 1 from events s where s.body->>'subject' = $1 and s.body->>'type' = 'package.pr-started' and s.body->>'at' > $2
       and not exists (select 1 from events o where o.body->>'subject' = $1 and o.body->>'type' in ('package.pr-opened', 'package.pr-not-opened')
                         and o.body->'data'->>'claim' = s.body->'data'->>'claim')
     limit 1`, [packageId, since]);
  return (r.rowCount ?? 0) > 0;
}
