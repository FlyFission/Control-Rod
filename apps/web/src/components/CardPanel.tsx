import { createContext, type MouseEvent, type ReactNode, useContext } from "react";
import { Link } from "@tanstack/react-router";

/** What to open with a card in the side panel: a run's full log over it, for one. */
export interface CardOpen {
  id: string;
  /** Opens this run's full log over the card. */
  runLog?: string;
}

/**
 * Opens any card in the side panel from anywhere in the app (Today, Packages, Runs, the Plant), so
 * clicking work never leaves the page the person is on. Provided by the shell.
 */
export const CardPanelContext = createContext<((open: CardOpen) => void) | undefined>(undefined);

export function useCardPanel() {
  return useContext(CardPanelContext);
}

/** A run hash (#run-<id>) on a package link, as the inbox and runs list write them. */
export function runFromHash(hash: string | undefined): string | undefined {
  return hash?.startsWith("run-") ? hash.slice(4) : undefined;
}

/**
 * A link to a card that opens it in the side panel. It stays a real link to the full case page:
 * Cmd/Ctrl-click, a middle click or "Open in new tab" still go there.
 */
export function CardLink({ id, hash, className, children, onOpen, title }: { id: string; hash?: string; className?: string; children: ReactNode; onOpen?: () => void; title?: string }) {
  const open = useCardPanel();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onOpen?.();
    if (!open || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const runLog = runFromHash(hash);
    open(runLog ? { id, runLog } : { id });
  };
  return (
    <Link to="/packages/$id" params={{ id }} {...(hash ? { hash } : {})} className={className} onClick={onClick} data-opens-drawer="" {...(title ? { title } : {})}>
      {children}
    </Link>
  );
}
