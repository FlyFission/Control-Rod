// Typed calls to the control plane. Paths match spec/generated/openapi/openapi.json exactly;
// the API serves this app at the same origin, so every path is relative to it.
import type {
  Capture,
  CrEvent,
  Decision,
  DecisionRequest,
  Digest,
  Metrics,
  NewCapture,
  OfficeItem,
  PackageView,
  Session,
  WorkPackage,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function url(path: string): string {
  return new URL(path, window.location.origin).toString();
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url(path), init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string };
    throw new ApiError(res.status, err.code ?? "error", err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  session: () => call<Session>("GET", "/auth/session"),
  registerOptions: (name: string) =>
    call<{ options: Record<string, unknown> }>("POST", "/auth/register/options", { name }),
  registerVerify: (body: unknown) => call<Session>("POST", "/auth/register/verify", body),
  loginOptions: () => call<{ options: Record<string, unknown> }>("POST", "/auth/login/options"),
  loginVerify: (body: unknown) => call<Session>("POST", "/auth/login/verify", body),
  logout: () => call<Session>("POST", "/auth/logout"),

  captures: () => call<Capture[]>("GET", "/captures"),
  capture: (body: NewCapture) => call<Capture>("POST", "/captures", body),

  packages: () => call<WorkPackage[]>("GET", "/packages"),
  packageView: (id: string) => call<PackageView>("GET", `/packages/${enc(id)}`),
  updatePackage: (pkg: WorkPackage) => call<WorkPackage>("PUT", `/packages/${enc(pkg.id)}`, pkg),
  runLog: (id: string, runId: string) =>
    call<{ lines: string[] }>("GET", `/packages/${enc(id)}/runs/${enc(runId)}/log`),
  outputUrl: (id: string, name: string) => url(`/packages/${enc(id)}/outputs/${enc(name)}`),
  decisionOptions: (id: string, req: DecisionRequest) =>
    call<{ subject_digest: Digest; options: Record<string, unknown> }>(
      "POST",
      `/packages/${enc(id)}/decisions/options`,
      req,
    ),
  decide: (id: string, body: DecisionRequest & { assertion: Record<string, unknown> }) =>
    call<Decision>("POST", `/packages/${enc(id)}/decisions`, body),

  office: () => call<OfficeItem[]>("GET", "/office"),
  metrics: () => call<Metrics>("GET", "/metrics"),
  events: (after?: number) => call<CrEvent[]>("GET", after === undefined ? "/events" : `/events?after=${after}`),
  verifyEvents: () => call<{ ok: boolean; count: number; broken_at?: number }>("GET", "/events/verify"),
  streamUrl: () => url("/events/stream"),
};

export type Api = typeof api;
