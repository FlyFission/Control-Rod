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
    act(() => adoptSession(qc, { registered: true, signed_in: true, user: "ben" } as Session));
    await screen.findByText("signed in");
    expect(qc.getQueryData(["packages"])).toBeUndefined();
  });
});
