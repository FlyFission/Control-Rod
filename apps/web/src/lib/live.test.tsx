import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLiveEvents } from "./live.js";

/** A stand-in event stream the test can push messages through. */
class FakeSource {
  static last: FakeSource | undefined;
  private listeners = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(type: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  close() {}
}

describe("live events", () => {
  it("refreshes the package a run event names in its data, not only its subject", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      const qc = new QueryClient();
      const spy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      renderHook(() => useLiveEvents(true), { wrapper });
      FakeSource.last?.emit("event", { seq: 9, type: "run.label", subject: "R-1234", data: { package: "WP-9", label: "Run: cr-example" } });
      await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["package", "WP-9"] }));
      expect(spy).toHaveBeenCalledWith({ queryKey: ["package", "R-1234"] });
      // Preparation lives on its own key, edited and confirmed elsewhere; it is refreshed too.
      expect(spy).toHaveBeenCalledWith({ queryKey: ["preparation", "WP-9"] });
      // What the viewer may do is refreshed too, so the palette never offers a stale command.
      for (const key of ["actions", "admin", "runtimes"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes everything only when the stream says history was lost", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      const qc = new QueryClient();
      const spy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      renderHook(() => useLiveEvents(true), { wrapper });
      FakeSource.last?.emit("open", {});
      expect(spy).not.toHaveBeenCalledWith();
      FakeSource.last?.emit("loss", { resume_from: 10, reason: "too far behind to replay" });
      expect(spy).toHaveBeenCalledWith();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
