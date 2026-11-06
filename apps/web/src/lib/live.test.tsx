import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { resetLiveStatus, useLiveEvents, useLiveStatus } from "./live.js";

/** A stand-in event stream the test can push messages through. */
class FakeSource {
  static last: FakeSource | undefined;
  closed = false;
  private listeners = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(type: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown, lastEventId = "") {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data), lastEventId } as MessageEvent<string>);
  }
  close() {
    this.closed = true;
  }
}

describe("live events", () => {
  it("refreshes the package a run event names in its data, not only its subject", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      const qc = new QueryClient();
      const spy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      renderHook(() => useLiveEvents(true), { wrapper });
      FakeSource.last?.emit("event", { seq: 9, type: "run.label", subject: "R-1234", data: { package: "WP-9", label: "Run: python3" } });
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

  it("reads connecting until the stream opens, then live, then unknown after an error", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => { useLiveEvents(true); return useLiveStatus(); }, { wrapper });
      expect(result.current.status).toBe("connecting");
      act(() => FakeSource.last?.emit("open", {}));
      expect(result.current.status).toBe("live");
      act(() => FakeSource.last?.emit("error", {}));
      expect(result.current.status).toBe("unknown");
      expect(result.current.unknownSince).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("resumes after the last event it saw and refreshes what it shows on the first open after a drop", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      let reads = 0;
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(
        () => {
          useLiveEvents(true);
          useQuery({ queryKey: ["packages"], queryFn: () => ++reads });
          return useLiveStatus();
        },
        { wrapper },
      );
      await waitFor(() => expect(reads).toBe(1));
      const first = FakeSource.last!;
      expect(first.url).not.toContain("after=");
      act(() => first.emit("checkpoint", { head: 40 }, "40"));
      expect(result.current.status).toBe("live");
      act(() => first.emit("event", { seq: 41, type: "package.edited", subject: "WP-1" }, "41"));
      act(() => first.emit("error", {}));
      expect(result.current.status).toBe("unknown");
      act(() => result.current.reconnect());
      const second = FakeSource.last!;
      expect(second).not.toBe(first);
      expect(second.url).toContain("after=41");
      const before = reads;
      act(() => second.emit("open", {}));
      // The outage may have hidden a change no replay names, so everything on screen is read again,
      // and only then does the stream read live.
      await waitFor(() => expect(reads).toBeGreaterThan(before));
      await waitFor(() => expect(result.current.status).toBe("live"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stays live on heartbeats and reads unknown, closing the stream, after 45 seconds of silence", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => { useLiveEvents(true); return useLiveStatus(); }, { wrapper });
      const source = FakeSource.last!;
      act(() => source.emit("open", {}));
      expect(result.current.status).toBe("live");
      for (let i = 0; i < 4; i++) {
        act(() => vi.advanceTimersByTime(15_000));
        act(() => source.emit("heartbeat", { at: "2026-11-06T10:00:00Z" }));
      }
      expect(result.current.status).toBe("live");
      expect(source.closed).toBe(false);
      act(() => vi.advanceTimersByTime(44_000));
      expect(result.current.status).toBe("live");
      act(() => vi.advanceTimersByTime(1_000));
      expect(result.current.status).toBe("unknown");
      expect(result.current.unknownSince).toBeTruthy();
      expect(source.closed).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("marks the stream live on its checkpoint frame", () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => { useLiveEvents(true); return useLiveStatus(); }, { wrapper });
      act(() => FakeSource.last!.emit("checkpoint", { head: 3 }, "3"));
      expect(result.current.status).toBe("live");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stays unknown after a reconnect until the refreshed reads of the work have arrived", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      let release: (() => void) | undefined;
      let reads = 0;
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(
        () => {
          useLiveEvents(true);
          useQuery({
            queryKey: ["packages"],
            queryFn: () => (++reads === 1 ? Promise.resolve(reads) : new Promise<number>((r) => (release = () => r(reads)))),
          });
          return useLiveStatus();
        },
        { wrapper },
      );
      await waitFor(() => expect(reads).toBe(1));
      act(() => FakeSource.last!.emit("open", {}));
      act(() => FakeSource.last!.emit("error", {}));
      act(() => result.current.reconnect());
      act(() => FakeSource.last!.emit("open", {}));
      await waitFor(() => expect(reads).toBe(2));
      // The refresh is still in flight: what is on screen is not yet current.
      expect(result.current.status).toBe("unknown");
      act(() => FakeSource.last!.emit("heartbeat", {}));
      expect(result.current.status).toBe("unknown");
      await act(async () => release!());
      await waitFor(() => expect(result.current.status).toBe("live"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stays unknown after a reconnect when the refreshed read of the work fails", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      let reads = 0;
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(
        () => {
          useLiveEvents(true);
          useQuery({ queryKey: ["office"], queryFn: () => (++reads === 1 ? Promise.resolve([]) : Promise.reject(new Error("down"))) });
          return useLiveStatus();
        },
        { wrapper },
      );
      await waitFor(() => expect(reads).toBe(1));
      act(() => FakeSource.last!.emit("open", {}));
      act(() => FakeSource.last!.emit("error", {}));
      act(() => result.current.reconnect());
      act(() => FakeSource.last!.emit("open", {}));
      await waitFor(() => expect(reads).toBe(2));
      await act(async () => {});
      await new Promise((r) => setTimeout(r, 50));
      expect(result.current.status).toBe("unknown");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stays unknown when a second refresh during recovery replaces the first, until the replacement arrives", async () => {
    vi.stubGlobal("EventSource", FakeSource);
    try {
      resetLiveStatus();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      const releases: (() => void)[] = [];
      let reads = 0;
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      const { result } = renderHook(
        () => {
          useLiveEvents(true);
          useQuery({
            queryKey: ["packages"],
            queryFn: ({ signal }) =>
              ++reads === 1
                ? Promise.resolve(reads)
                : new Promise<number>((resolve, reject) => {
                    const n = reads;
                    releases.push(() => resolve(n));
                    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                  }),
          });
          return useLiveStatus();
        },
        { wrapper },
      );
      await waitFor(() => expect(reads).toBe(1));
      act(() => FakeSource.last!.emit("open", {}));
      act(() => FakeSource.last!.emit("error", {}));
      act(() => result.current.reconnect());
      act(() => FakeSource.last!.emit("open", {}));
      await waitFor(() => expect(reads).toBe(2));
      // A loss frame refreshes everything again, replacing the recovery's read.
      act(() => FakeSource.last!.emit("loss", { resume_from: 9 }, "9"));
      await waitFor(() => expect(reads).toBe(3));
      await act(async () => {});
      await new Promise((r) => setTimeout(r, 30));
      expect(result.current.status).toBe("unknown");
      await act(async () => releases[releases.length - 1]!());
      await waitFor(() => expect(result.current.status).toBe("live"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
