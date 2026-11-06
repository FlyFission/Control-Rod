import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { ActionDescriptor, PersonVerificationEntry, WorkPackage } from "../../api/types.js";
import { type ColumnId, boardColumn, isVerified, needsIndependentCheck, preCheckState } from "../../lib/board.js";
import { type Kind, kindsOf } from "../../lib/kind.js";
import { useLiveStatus } from "../../lib/live.js";
import { type NextLine, hasOtherQualified, nextLine } from "../../lib/next.js";

export type BoardCard = {
  pkg: WorkPackage;
  kinds: Kind[];
  column: ColumnId;
  next: NextLine;
  /** The person who originated the work (first originator), if the server named one. */
  owner?: string;
  /** An agent run on this revision is queued or running. */
  runActive: boolean;
};

export type BoardData = {
  cards: BoardCard[];
  loading: boolean;
  status: "connecting" | "live" | "unknown";
  unknownSince?: string;
  reconnect(): void;
  /** Cards whose next line is waiting on the viewer or blocked. */
  needsYou: number;
  agentsRunning: number;
};

const CHECKING: NextLine = { tone: "wait", text: "Checking what is next" };

/**
 * Everything the board shows. The package list gives the cards; each card also reads its package view
 * (owner, runs), the actions the viewer may take and, where a person verification could matter, the
 * recorded verifications. Status comes from the event stream: when it is unknown, the cards say so.
 */
export function useBoardData(): BoardData {
  const live = useLiveStatus();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const office = useQuery({ queryKey: ["office"], queryFn: api.office });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });

  const visible = (packages.data ?? []).filter((p) => p.status !== "closed");
  const views = useQueries({ queries: visible.map((p) => ({ queryKey: ["package", p.id], queryFn: () => api.packageView(p.id) })) });
  const actions = useQueries({ queries: visible.map((p) => ({ queryKey: ["actions", p.id], queryFn: () => api.packageActions(p.id) })) });
  const verifs = useQueries({
    queries: visible.map((p) => ({
      queryKey: ["person-verifications", p.id],
      queryFn: () => api.personVerifications(p.id),
      enabled: p.status === "in-verification" && needsIndependentCheck(p),
    })),
  });

  const user = session.data?.user;
  const memberId = admin.data?.members.find((m) => m.user_name === user && m.status === "active")?.id;
  const officeItems = office.data ?? [];

  const cards: BoardCard[] = [];
  visible.forEach((p, i) => {
    const view = views[i]?.data;
    const acts: ActionDescriptor[] | undefined = actions[i]?.data;
    const verifications: PersonVerificationEntry[] | undefined = verifs[i]?.data;
    const pre = preCheckState(p, officeItems);
    const column = boardColumn(p, pre, verifications ? isVerified(p, verifications) : null);
    if (column === null) return;
    const owner = view?.originators?.[0];
    const runActive = (view?.runs ?? []).some((r) => r.status === "running" || r.status === "queued");
    const verifState = verifs[i];
    const waitingOnVerifs = verifState?.isPending === true && verifState.fetchStatus !== "idle";
    const verifsFailed = verifState?.isError === true;
    const verified = verifications ? isVerified(p, verifications) : null;
    let next: NextLine;
    if (acts === undefined || view === undefined || waitingOnVerifs) next = CHECKING;
    else if (verifsFailed) next = { tone: "wait", text: "Could not read person verifications" };
    else if (column === "person-verifies" && (session.data === undefined || admin.isPending)) next = CHECKING;
    else if (column === "person-verifies" && (admin.data === undefined || session.isError)) next = { tone: "wait", text: "Cannot tell who can verify" };
    else
      next = nextLine({
        pkg: p,
        actions: acts,
        office: officeItems,
        verifications: verifications ?? [],
        verified,
        viewerIsOriginator: user !== undefined && (view.originators ?? []).includes(user),
        // A viewer with no member row counts as not qualified, and so is no help to a second check.
        otherQualifiedVerifier: memberId !== undefined && admin.data !== undefined && hasOtherQualified(admin.data, memberId, p.grade ?? ""),
        runActive,
      });
    cards.push({ pkg: p, kinds: kindsOf(p), column, next, ...(owner ? { owner } : {}), runActive });
  });

  return {
    cards,
    loading: packages.isLoading,
    status: live.status,
    ...(live.unknownSince ? { unknownSince: live.unknownSince } : {}),
    reconnect: live.reconnect,
    needsYou: cards.filter((c) => c.next.tone === "needs" || c.next.tone === "block").length,
    agentsRunning: cards.filter((c) => c.runActive).length,
  };
}
