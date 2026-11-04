// Typed calls to the control plane. Paths match spec/generated/openapi/openapi.json exactly;
// the API serves this app at the same origin, so every path is relative to it.
import type { ActionDescriptor, AdminView, RosterView, UsageView, DataLane, InboxView, NormalizedEvent, RuntimePin,
  RequirementsConfirmation,
  PreparationView,
  PreparationContent,
  ResolutionRequest,
  Capture,
  CaptureView,
  CrEvent,
  Decision,
  DecisionRequest,
  Digest,
  Metrics,
  NewCapture,
  OfficeItem,
  OfficeFloor,
  ScramDetail,
  ChainHead, PackageProof, RecordsVerification, ScramPreview, ScramSummary,
  PackageView,
  Run,
  RuntimeStatus,
  Session,
  WorkPackage,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The one fact that would change the answer, when the server says. */
    readonly change?: string,
  ) {
    super(message);
  }
}

/** A refusal in words for people: what happened, then what would change it. */
export function explain(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.change ? `${e.message}. ${e.change}`.replace(/\.\. /, ". ") : e.message;
  return e instanceof Error ? e.message : fallback;
}

function url(path: string): string {
  return new URL(path, window.location.origin).toString();
}

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string,string> = {}): Promise<T> {
  return (await send<T>(method, path, body, headers)).data;
}

/** Like `call`, and also returns the response's ETag. */
async function callTagged<T>(method: string, path: string, body?: unknown, headers: Record<string,string> = {}): Promise<{ data: T; etag: string | null }> {
  return send<T>(method, path, body, headers);
}

async function send<T>(method: string, path: string, body?: unknown, headers: Record<string,string> = {}): Promise<{ data: T; etag: string | null }> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { ...headers } };
  if (body !== undefined) {
    init.headers = { ...headers, "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url(path), init);
  if (res.status === 204) return { data: undefined as T, etag: res.headers.get("etag") };
  const text = await res.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; change?: string };
    throw new ApiError(res.status, err.code ?? "error", err.message ?? `Request failed (${res.status})`, err.change);
  }
  return { data: data as T, etag: res.headers.get("etag") };
}

const enc = encodeURIComponent;

export const api = {
  session: () => call<Session>("GET", "/auth/session"),
  registerOptions: (name: string) =>
    call<{ options: Record<string, unknown> }>("POST", "/auth/register/options", { name }),
  registerVerify: (body: unknown) => call<Session>("POST", "/auth/register/verify", body),
  /** Registration options for an invited Member, from the invitation an administrator gave them. */
  registerInvitedOptions: (invitation: string) =>
    call<{ options: Record<string, unknown> }>("POST", "/auth/register/options", { invitation }),
  /** An administrative command that needs no signature (a proposal or a preference). */
  adminUnsigned: <T = Record<string, unknown>>(name: string, payload: Record<string, unknown>) =>
    call<T>("POST", `/admin/commands/${enc(name)}`, { payload }),
  loginOptions: () => call<{ options: Record<string, unknown> }>("POST", "/auth/login/options"),
  loginVerify: (body: unknown) => call<Session>("POST", "/auth/login/verify", body),
  logout: () => call<Session>("POST", "/auth/logout"),

  captures: () => call<CaptureView[]>("GET", "/captures"),
  capture: (body: NewCapture) => call<Capture>("POST", "/captures", body),
  /** Classifies a capture's data lane; until then no AI runtime sees it. */
  classifyCapture: (id: string, lane: DataLane) => call<Capture>("POST", `/captures/${enc(id)}/classify`, { lane }),

  refreshPreparationBasis: (id:string,etag:string) => call<PreparationView>("POST",`/packages/${enc(id)}/preparation/basis/refresh`,undefined,{"if-match":etag}),
  preparationConfirmationOptions: (id:string,expected:Digest) => call<{requirements_digest:Digest;options:Record<string,unknown>}>("POST",`/packages/${enc(id)}/preparation/confirm/options`,{expected_requirements_digest:expected}),
  confirmPreparation: (id:string,assertion:Record<string,unknown>) => call<RequirementsConfirmation>("POST",`/packages/${enc(id)}/preparation/confirm`,{assertion}),
  preparation: (id: string) =>
    call<PreparationView>("GET", `/packages/${enc(id)}/preparation`),
  enrollPreparation: (id: string, revision: number, key: string) =>
    call<PreparationView>("POST", `/packages/${enc(id)}/preparation`, {
      package_revision: revision,
      idempotency_key: key,
    }),
  savePreparation: (id: string, etag: string, content: PreparationContent) =>
    call<PreparationView>("PUT", `/packages/${enc(id)}/preparation`, content, {
      "if-match": etag,
    }),
  resolvePreparation: (
    id: string,
    etag: string,
    resolution: ResolutionRequest,
  ) =>
    call<PreparationView>(
      "POST",
      `/packages/${enc(id)}/preparation/resolutions`,
      resolution,
      { "if-match": etag },
    ),
  preparationHistory: (id: string, before?: number) =>
    call<{ revisions: PreparationView[]; next_before?: number }>(
      "GET",
      `/packages/${enc(id)}/preparation/history${before === undefined ? "" : `?before=${before}`}`,
    ),
  packages: () => call<WorkPackage[]>("GET", "/packages"),
  packageView: (id: string) => call<PackageView>("GET", `/packages/${enc(id)}`),
  /** Saves a draft the caller loaded with `etag`; a stale tag is refused so no edit is lost. */
  updatePackage: (pkg: WorkPackage, etag: string) => callTagged<WorkPackage>("PUT", `/packages/${enc(pkg.id)}`, pkg, { "if-match": etag }),
  runEvents: (id: string, runId: string, after = 0) =>
    call<{ events: { seq: number; event: NormalizedEvent }[] }>("GET", `/packages/${enc(id)}/runs/${enc(runId)}/events${after > 0 ? `?after=${after}` : ""}`),
  runLog: (id: string, runId: string) =>
    call<{ lines: string[] }>("GET", `/packages/${enc(id)}/runs/${enc(runId)}/log`),
  stopRun: (id: string, runId: string) => call<Run>("POST", `/packages/${enc(id)}/runs/${enc(runId)}/stop`),
  overrideOptions: (id: string, runId: string, reason: string) =>
    call<{ subject_digest: Digest; options: Record<string, unknown> }>(
      "POST",
      `/packages/${enc(id)}/runs/${enc(runId)}/override-independence/options`,
      { reason },
    ),
  overrideIndependence: (id: string, runId: string, body: { reason: string; assertion: Record<string, unknown> }) =>
    call<Run>("POST", `/packages/${enc(id)}/runs/${enc(runId)}/override-independence`, body),
  reconcileOptions: (id: string, runId: string, reason: string) =>
    call<{ subject_digest: Digest; options: Record<string, unknown> }>("POST", `/packages/${enc(id)}/runs/${enc(runId)}/reconcile/options`, { reason }),
  reconcileRun: (id: string, runId: string, body: { reason: string; assertion: Record<string, unknown> }) =>
    call<Run>("POST", `/packages/${enc(id)}/runs/${enc(runId)}/reconcile`, body),
  requeueRun: (id: string, runId: string) => call<Run>("POST", `/packages/${enc(id)}/runs/${enc(runId)}/requeue`),
  verificationEvidenceUrl: (id:string,runId:string,name:string) => url(`/packages/${enc(id)}/verification-evidence/${enc(runId)}/${name.split("/").map(enc).join("/")}`),
  outputUrl: (id: string, path: string) => url(`/packages/${enc(id)}/outputs/${path.split("/").map(enc).join("/")}`),
  decisionOptions: (id: string, req: DecisionRequest) =>
    call<{ subject_digest: Digest; options: Record<string, unknown> }>(
      "POST",
      `/packages/${enc(id)}/decisions/options`,
      req,
    ),
  decide: (id: string, body: DecisionRequest & { assertion: Record<string, unknown> }) =>
    call<Decision>("POST", `/packages/${enc(id)}/decisions`, body),

  office: () => call<OfficeItem[]>("GET", "/office"),
  officeFigures: (presenting: boolean) => call<OfficeFloor>("GET", presenting ? "/office/figures?presenting=true" : "/office/figures"),
  inbox: (since?: number) => call<InboxView>("GET", since === undefined ? "/inbox" : `/inbox?since=${since}`),
  runtimes: () => call<{ reported_at?: string; runtimes: RuntimeStatus[]; pins: RuntimePin[] }>("GET", "/runtimes"),
  admin: () => call<AdminView>("GET", "/admin"),
  roster: () => call<RosterView>("GET", "/roster"),
  usage: () => call<UsageView>("GET", "/usage"),
  adminCommandOptions: (name: string, payload: Record<string, unknown>) =>
    call<{ subject_digest: Digest; options: Record<string, unknown> }>("POST", `/admin/commands/${enc(name)}/options`, { payload }),
  adminCommand: <T = Record<string, unknown>>(name: string, payload: Record<string, unknown>, assertion: Record<string, unknown>) =>
    call<T>("POST", `/admin/commands/${enc(name)}`, { payload, assertion }),
  scrams: (presenting = false) => call<{ scrams: ScramSummary[]; presenting?: boolean }>("GET", presenting ? "/scrams?presenting=true" : "/scrams"),
  scramPreview: (scope: "organization" | "project", projectId?: string, presenting = false) =>
    call<ScramPreview>("GET", `/scrams/preview?scope=${enc(scope)}${projectId ? `&project_id=${enc(projectId)}` : ""}${presenting ? "&presenting=true" : ""}`),
  scram: (id: string) => call<ScramDetail>("GET", `/scrams/${enc(id)}`),
  packageActions: (id: string) => call<ActionDescriptor[]>("GET", `/packages/${enc(id)}/actions`),
  metrics: () => call<Metrics>("GET", "/metrics"),
  events: (after?: number) => call<CrEvent[]>("GET", after === undefined ? "/events" : `/events?after=${after}`),
  /** Every event, following the server's `after` cursor page by page (500 per page, capped). */
  allEvents: async (maxPages = 200): Promise<CrEvent[]> => {
    const out: CrEvent[] = [];
    let after = 0;
    for (let i = 0; i < maxPages; i++) {
      const page = await call<CrEvent[]>("GET", after === 0 ? "/events" : `/events?after=${after}`);
      out.push(...page);
      if (page.length < 500) break;
      after = page[page.length - 1]?.seq ?? after;
    }
    return out;
  },
  verifyEvents: () => call<{ ok: boolean; count: number; broken_at?: number }>("GET", "/events/verify"),
  verifyRecords: () => call<RecordsVerification>("GET", "/records/verify"),
  recordsHead: () => call<{ head: ChainHead | null }>("GET", "/records/head"),
  packageProof: (id: string) => call<PackageProof>("GET", `/packages/${enc(id)}/proof`),
  streamUrl: () => url("/events/stream"),
};

export type Api = typeof api;
