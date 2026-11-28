import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AgentSetupRequest, AgentSetupView, CheckIn, Writing } from "../api/types.js";
import { AGENTS, type AgentId, type AgentRow, agentRows } from "./agents.js";

/** The three reads the roster and setup share, joined into rows, and the one write that saves a setup. */
export function useAgents() {
  const qc = useQueryClient();
  const runtimes = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setup });
  // A read of /setup sent before a write may answer after it; cancel it so it cannot replace what the write returned.
  const settle = async (view: AgentSetupView) => {
    await qc.cancelQueries({ queryKey: ["setup"] });
    qc.setQueryData(["setup"], view);
  };
  const save = useMutation({
    mutationFn: (body: AgentSetupRequest) => api.recordSetup(body),
    onMutate: () => qc.cancelQueries({ queryKey: ["setup"] }),
    onSuccess: settle,
  });
  const seat = useMutation({
    mutationFn: ({ runtime, seated }: { runtime: AgentId; seated: boolean }) => api.recordSeat(runtime, seated),
    onMutate: () => qc.cancelQueries({ queryKey: ["setup"] }),
    onSuccess: settle,
  });
  const rows: AgentRow[] = agentRows(runtimes.data?.runtimes, subs.data, setup.data);
  return {
    rows,
    setup: setup.data,
    loading: runtimes.isLoading || subs.isLoading || setup.isLoading,
    error: runtimes.isError || subs.isError || setup.isError,
    refetch: () => {
      void runtimes.refetch();
      void subs.refetch();
      void setup.refetch();
    },
    save,
    seat,
  };
}

/**
 * The request for what the person changed: the seats they flipped and, if they picked them, the
 * check-in answer and the writing choice.
 * Whatever is left out keeps its saved value on the server. Only agents Control Rod can run carry a seat.
 */
export function setupRequest(changed: Record<string, boolean>, checkIn: CheckIn | null, writing: Writing | null = null): AgentSetupRequest {
  return {
    seats: AGENTS.filter((a) => a.runnable && changed[a.id] !== undefined).map((a) => ({ runtime: a.id, seated: changed[a.id]! })),
    ...(checkIn ? { check_in: checkIn } : {}),
    ...(writing ? { writing } : {}),
  };
}

export function seatsOf(rows: AgentRow[]): Record<AgentId, boolean> {
  return Object.fromEntries(rows.map((r) => [r.info.id, r.seated])) as Record<AgentId, boolean>;
}

/** The platform the daemon reported ("darwin", "linux", "wsl2"), or undefined until it has reported. */
export function useAgentPlatform(): string | undefined {
  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  return subs.data?.reported ? subs.data.platform : undefined;
}

/**
 * True when Control Rod has said which agents it found and none of them can take work: no seated agent
 * is ready, and no other runtime (the test-only fake) is ready either. False while that is loading or
 * could not be read, so a card never claims "no agent is ready" on a guess.
 */
export function useNoAgentReady(): boolean {
  const agents = useAgents();
  const runtimes = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  if (agents.loading || agents.error) return false;
  const known = new Set<string>(AGENTS.map((a) => a.id));
  const otherReady = (runtimes.data?.runtimes ?? []).some((r) => r.ready && !known.has(r.runtime));
  return !otherReady && !agents.rows.some((r) => r.seated && r.state === "ready");
}
