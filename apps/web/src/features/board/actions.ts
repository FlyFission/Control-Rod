import type { ActionDescriptor, DecisionKind } from "../../api/types.js";
import { DECISION_LABEL } from "../../lib/decide.js";

/** One entry in a card's Move to menu: a decision or Stop, never a column name (spec 6.2, B3). */
export type MenuItem = {
  id: DecisionKind | "stop";
  label: string;
  enabled: boolean;
  /** Why it is not open now, in the server's own words. */
  reason?: string;
  /** What would change that. */
  change?: string;
};

/** The order decisions appear in, most frequent first. */
const ORDER: readonly DecisionKind[] = ["release", "accept", "accept-with-findings", "return", "reject"];

/** The decisions that may sit on the card face as its one primary button. */
const PRIMARY: readonly DecisionKind[] = ["release", "accept"];

const isKind = (c: string): c is DecisionKind => (ORDER as readonly string[]).includes(c);

/**
 * The card's menu, from the actions the viewer is offered (the server's list with ruling 16 already
 * applied). Every decision the server names is listed: allowed ones enabled, refused ones disabled with
 * the server's reason and change. Stop is listed only while a run is queued or running.
 */
export function menuItems(actions: ActionDescriptor[], runActive: boolean): MenuItem[] {
  const items: MenuItem[] = [];
  for (const kind of ORDER) {
    const a = actions.find((x) => x.command === kind && isKind(x.command));
    if (!a) continue;
    items.push({
      id: kind,
      label: DECISION_LABEL[kind],
      enabled: a.allowed,
      ...(!a.allowed && a.reason ? { reason: a.reason } : {}),
      ...(!a.allowed && a.change ? { change: a.change } : {}),
    });
  }
  if (runActive) items.push({ id: "stop", label: "Stop run", enabled: true });
  return items;
}

/** The one action shown as a button on the card face: an open Release or Accept, if there is one. */
export function primaryItem(items: MenuItem[]): MenuItem | undefined {
  for (const kind of PRIMARY) {
    const item = items.find((i) => i.id === kind && i.enabled);
    if (item) return item;
  }
  return undefined;
}
