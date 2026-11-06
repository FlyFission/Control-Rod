import { useQueries, useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../../api/client.js";
import type { ActionDescriptor, PersonVerificationEntry, WorkPackage } from "../../api/types.js";
import { type ColumnId, acceptVerified, blockUnverifiedAccept, boardColumn, needsIndependentCheck, preCheckState, verificationRead } from "../../lib/board.js";
import { type Kind, kindsOf } from "../../lib/kind.js";
import { useLiveStatus } from "../../lib/live.js";
import { type NextLine, hasOtherQualified, nextLine } from "../../lib/next.js";

export type BoardCard = {
  pkg: WorkPackage;
  kinds: Kind[];
  column: ColumnId;
  next: NextLine;
  /** The person who originated the work (first originator, a user name), if the server named one. */
  owner?: string;
  /** An agent run on this revision is queued or running. */
  runActive: boolean;
  /** Set when a read behind the next line failed: reads it again. */
  retry?: () => void;
  /** A read behind this card has not succeeded since the latest stream drop: what it shows is last known. */
  lastKnown: boolean;
};

/** How far a count can be trusted: from current reads, from reads not refreshed since a drop or failed to refresh, or not at all. */
export type Confidence = "current" | "last-known" | "unknown";

export type BoardData = {
  cards: BoardCard[];
  loading: boolean;
  /** The reads the whole board rests on that failed, in plain words; empty when none did. */
  problems: string[];
  /** Reads the failed board-wide queries again. */
  retry(): void;
  status: "connecting" | "live" | "unknown";
  unknownSince?: string;
  reconnect(): void;
  /** Cards whose next line is waiting on the viewer or blocked. */
  needsYou: number;
  /** Cards with an agent run queued or running. */
  agentsRunning: number;
  /**
   * What the counts rest on: "unknown" before any successful read of the work (no count is shown),
   * "last-known" after a failed refresh or while the stream is unknown, "current" otherwise.
   */
  counts: Confidence;
  /** Confidence of each header count, from every read that count needs. */
  needsYouCounts: Confidence;
  agentsRunningCounts: Confidence;
};

const CHECKING: NextLine = { tone: "wait", text: "Checking what is next" };
const NO_NEXT: NextLine = { tone: "wait", text: "Could not read what is next" };

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

  const officeItems = office.data ?? [];
  // A read is fresh when it has succeeded since the latest stream drop (or there was none). Reads that
  // were inactive at the drop, for example while the viewer was on another page, are refreshed only
  // when they become active again; until then their data is last known.
  const dropped = live.droppedAt;
  const fresh = (q: { dataUpdatedAt: number; isError: boolean } | undefined) =>
    q !== undefined && !q.isError && (dropped === undefined || q.dataUpdatedAt > dropped);
  const boardFresh = fresh(packages) && fresh(office);
  let undetermined = false;
  let runsUnread = false;
  let anyStale = false;
  // Originators are user names; the registry is keyed by member id.
  const memberIdOf = new Map((admin.data?.members ?? []).map((m) => [m.user_name, m.id]));

  const cards: BoardCard[] = [];
  visible.forEach((p, i) => {
    const viewQ = views[i];
    const actsQ = actions[i];
    const verifQ = verifs[i];
    const view = viewQ?.data;
    const acts: ActionDescriptor[] | undefined = actsQ?.data;
    const verifications: PersonVerificationEntry[] | undefined = verifQ?.data;
    const pre = preCheckState(p, officeItems);
    // Ruling 11: verifications not yet read, or not readable, are not a pass. The card waits in
    // Person verifies rather than reading as cleared in Needs signature.
    // A failed refresh of a cached pass is unknown too, never a pass.
    const verified = verifQ ? verificationRead(p, verifQ) === true : false;
    const column = boardColumn(p, pre, verified);
    if (column === null) return;
    // The server lists only the caller's organization's work; a view that answers not-found means the
    // package is not this viewer's to see, so it gets no card even if a list once named it.
    if (viewQ?.error instanceof ApiError && viewQ.error.status === 404) return;
    const owner = view?.originators?.[0];
    const runActive = (view?.runs ?? []).some((r) => r.status === "running" || r.status === "queued");
    const waitingOnVerifs = verifQ?.isPending === true && verifQ.fetchStatus !== "idle";
    let next: NextLine;
    let retry: (() => void) | undefined;
    if (viewQ?.data === undefined || viewQ.isError) runsUnread = true;
    const cardFresh = boardFresh && fresh(viewQ) && fresh(actsQ) && (verifQ?.fetchStatus === "idle" && verifQ.isPending ? true : fresh(verifQ));
    if (!cardFresh) anyStale = true;
    if (viewQ?.isError || actsQ?.isError) {
      next = NO_NEXT;
      retry = () => {
        if (viewQ?.isError) void viewQ.refetch();
        if (actsQ?.isError) void actsQ.refetch();
      };
    } else if (acts === undefined || view === undefined || waitingOnVerifs) next = CHECKING;
    else if (verifQ?.isError) {
      next = { tone: "wait", text: "Could not read person verifications" };
      retry = () => void verifQ.refetch();
    } else if (column === "person-verifies" && (session.isError || admin.isError)) {
      next = { tone: "wait", text: "Cannot tell who can verify" };
      retry = () => {
        if (session.isError) void session.refetch();
        if (admin.isError) void admin.refetch();
      };
    } else if (column === "person-verifies" && (session.isPending || admin.isPending)) next = CHECKING;
    else {
      const originators = view.originators ?? [];
      const excluded = new Set(originators.flatMap((u) => memberIdOf.get(u) ?? []));
      next = nextLine({
        pkg: p,
        // Ruling 16 with a refresh in flight counted as unknown: a cached pass does not offer Accept.
        actions: blockUnverifiedAccept(p, acts, acceptVerified(p, verifQ ?? { isError: false, isFetching: false })),
        office: officeItems,
        verifications: verifications ?? [],
        verified,
        originators,
        otherQualifiedVerifier: admin.data !== undefined && hasOtherQualified(admin.data, { grade: p.grade ?? "general-service", ...(p.discipline ? { discipline: p.discipline } : {}) }, excluded),
        runActive,
      });
    }
    if (next === CHECKING || next === NO_NEXT || retry !== undefined) undetermined = true;
    cards.push({ pkg: p, kinds: kindsOf(p), column, next, ...(owner ? { owner } : {}), runActive, ...(retry ? { retry } : {}), lastKnown: !cardFresh });
  });

  const problems: string[] = [];
  if (packages.isError) problems.push("Could not load the work on this board.");
  if (office.isError) problems.push("Could not read the agent pre-check results, so cards may sit in Agent check.");

  return {
    cards,
    loading: packages.isPending,
    problems,
    retry: () => {
      if (packages.isError) void packages.refetch();
      if (office.isError) void office.refetch();
    },
    status: live.status,
    ...(live.unknownSince ? { unknownSince: live.unknownSince } : {}),
    reconnect: live.reconnect,
    counts: packages.data === undefined ? "unknown" : packages.isError || live.status === "unknown" || !boardFresh ? "last-known" : "current",
    needsYouCounts: packages.data === undefined || undetermined ? "unknown" : live.status === "unknown" || anyStale || packages.isError ? "last-known" : "current",
    agentsRunningCounts: packages.data === undefined || runsUnread ? "unknown" : live.status === "unknown" || anyStale || packages.isError ? "last-known" : "current",
    needsYou: cards.filter((c) => c.next.tone === "needs" || c.next.tone === "block").length,
    agentsRunning: cards.filter((c) => c.runActive).length,
  };
}
