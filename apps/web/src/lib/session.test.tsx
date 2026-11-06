import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Session } from "../api/types.js";
import { adoptSession } from "./session.js";

function Who() {
  const s = useQuery<Session>({ queryKey: ["session"], queryFn: async () => ({ registered: true, signed_in: false }), staleTime: Infinity });
  return <p>{s.data === undefined ? "loading" : s.data.signed_in ? "signed in" : "signed out"}</p>;
}

describe("adopting a new session", () => {
  it("redraws whatever is watching the session and drops everything else", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Who /></QueryClientProvider>);
    await screen.findByText("signed out");
    qc.setQueryData(["packages"], ["from the earlier session"]);
    await act(() => adoptSession(qc, { registered: true, signed_in: true, user: "ben" } as Session));
    await screen.findByText("signed in");
    expect(qc.getQueryData(["packages"])).toBeUndefined();
  });

  it("is not undone by a session request that started before it", async () => {
    let release!: (v: Session) => void;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["session"], { registered: true, signed_in: true, user: "ben" } as Session);
    const late = qc.fetchQuery({ queryKey: ["session"], queryFn: () => new Promise<Session>((r) => { release = r; }), staleTime: 0 });
    await adoptSession(qc, { registered: true, signed_in: false } as Session);
    release({ registered: true, signed_in: true, user: "ben" } as Session);
    await late.catch(() => undefined);
    expect(qc.getQueryData(["session"])).toMatchObject({ signed_in: false });
  });

  it("drops what the earlier session submitted, not only what it loaded", async () => {
    const qc = new QueryClient();
    await qc.getMutationCache().build(qc, { mutationFn: async (v: string) => v }).execute("capture text from the earlier person");
    expect(qc.getMutationCache().getAll()).toHaveLength(1);
    await adoptSession(qc, { registered: true, signed_in: false } as Session);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});
