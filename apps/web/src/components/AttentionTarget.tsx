import { Link } from "@tanstack/react-router";
import type { AttentionItem } from "../api/types.js";

/** The link that opens what an item is about, worded by what it asks of the person. */
export function attentionTargetLabel(item: AttentionItem): string {
  return item.kind === "scram" ? "Open SCRAM commands"
    : item.kind === "confirm" ? "Open and confirm"
    : item.capture_id !== undefined ? (item.href.to === "/roster" ? "Open the roster" : "Open Packages")
    : item.binds !== undefined ? "Open and decide"
    : "Open the runs";
}

export function AttentionTarget({ item, className = "btn primary small", label }: { item: AttentionItem; className?: string; label?: string }) {
  const text = label ?? attentionTargetLabel(item);
  if (item.href.to === "/packages/$id" && item.href.id !== undefined)
    return (
      <Link to="/packages/$id" params={{ id: item.href.id }} {...(item.href.hash ? { hash: item.href.hash } : {})} className={className}>
        {text}
      </Link>
    );
  return (
    <Link to={item.href.to} {...(item.href.hash ? { hash: item.href.hash } : {})} className={className}>
      {text}
    </Link>
  );
}
