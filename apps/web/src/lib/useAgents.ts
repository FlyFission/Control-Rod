import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AgentSetupRequest, AgentSetupView, CheckIn } from "../api/types.js";
import { AGENTS, type AgentId, type AgentRow, agentRows } from "./agents.js";

/** The three reads the roster and setup share, joined into rows, and the one write that saves a setup. */
export function useAgents() {
  const qc = useQueryClient();
  const runtimes = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setup });
  const save = useMutation({
    mutationFn: (body: AgentSetupRequest) => api.recordSetup(body),
    onSuccess: (view: AgentSetupView) => qc.setQueryData(["setup"], view),
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
  };
}

/** The request for these seats and this answer. Only agents Control Rod can run carry a seat. */
export function setupRequest(seats: Record<string, boolean>, checkIn: CheckIn): AgentSetupRequest {
  return {
    seats: AGENTS.filter((a) => a.runnable).map((a) => ({ runtime: a.id, seated: seats[a.id] ?? true })),
    check_in: checkIn,
  };
}

export function seatsOf(rows: AgentRow[]): Record<AgentId, boolean> {
  return Object.fromEntries(rows.map((r) => [r.info.id, r.seated])) as Record<AgentId, boolean>;
}
