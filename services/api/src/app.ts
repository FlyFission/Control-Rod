import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  type AuthConfig,
  assertionOptions,
  assertionVerify,
  endSession,
  isDaemon,
  isRegistered,
  registrationOptions,
  registrationVerify,
  sessionUser,
  startSession,
} from "./auth.js";
import type { Db } from "./db/index.js";
import { bus, eventPosition, listEvents, verifyOrganizationEvents } from "./events.js";
import { verificationEvidence } from "./preparation/results.js";
import { grantRoutes } from "./preparation/grant-routes.js";
import { preparationRoutes } from "./preparation/routes.js";
import { repoRoutes } from "./repos.js";
import { validateRawJson } from "./kernel.js";
import { loadValidator } from "./schemas.js";
import { agentUpdateView, recordAgentUpdates } from "./agent-updates.js";
import { REASONS, teach } from "./refusals.js";
import { listPersonVerifications, originatorsInOrder, personVerificationSubject, recordPersonVerification, requireOwnPackage } from "./person-verification.js";
import { inbox } from "./inbox.js";
import { officeFigures } from "./figures.js";
import { activeScramsFor, scramPreview, scramView } from "./scram.js";
import { roster } from "./roster.js";
import { adminRegistry, isAdministrator } from "./registry.js";
import { usageView } from "./budgets.js";
import { recordSubscriptionReport, subscriptionView } from "./subscriptions.js";
import { recordUsageLimits, usageLimitsView } from "./usage-limits.js";
import { recordSeat, recordSetup, setupView } from "./setup.js";
import { listWorkspaceProjects } from "./workspace-projects.js";
import { chainHead, inclusionProof, verifyRecords, windowExport } from "./seals.js";
import { ADMIN_COMMANDS, adminActions, adminCatalog, adminSubject, bundledThemes, callerFor, needsBootstrap, runAdmin } from "./admin.js";
import { DEFAULT_HARDWARE_FORMATS, currentPolicySet, currentQualification } from "./tenancy.js";
import {
  Refusal,
  type WorkConfig,
  applyDecision,
  claim,
  complete,
  classifyCapture,
  createCapture,
  dismissCapture,
  decisionChallenge,
  decisionSubject,
  listCaptures,
  listPackages,
  metrics,
  office,
  overrideChallenge,
  overrideIndependence,
  overrideSubject,
  checkerAttempts,
  recheckChallenge,
  recheckSubject,
  recordRecheckOverride,
  requestCheck,
  packageActions,
  packageLane,
  packageOutput,
  currentPackage,
  packageView,
  recordRuntimeStatus,
  requeueRun,
  runLog,
  runtimeStatus,
  stopRun,
  sweepLost,
  runEvidence,
  reconcileSubject,
  reconcileRun,
  updateDraft,
  publishAccepted,
  resumePublishing,
} from "./work.js";
import { activeRuns, activeRunSummaries, requireOwnedRun, runDetail, runEvents, runLogLines, type RunEventQuery } from "./run-reads.js";
import { runOutputPreview, runOutputs } from "./run-outputs.js";
import type { updateNoticeFor } from "./update-notice.js";

export const VERSION = "0.1.0";

/** The most missed events the stream replays on reconnect; further behind gets a loss frame. */
export const STREAM_REPLAY_MAX = 5000;

export interface AppOptions {
  db: Db;
  /** Where unhandled errors are reported. Default: one line on standard error with the stack. */
  onError?: (err: unknown) => void;
  auth: AuthConfig;
  root: string;
  updateNotice?: ReturnType<typeof updateNoticeFor>;
  /** Built web app to serve at /, if present. */
  webDir?: string;
  /** Seconds a run claim lasts without a heartbeat. Default 90. */
  leaseSeconds?: number;
  /** Enables new enrollment; existing companions stay controlled when off. */
  guidedPreparation?: boolean;
  preparedRelease?: boolean;
  preparationSources?: WorkConfig["preparationSources"];
  preparationRepositories?: WorkConfig["preparationRepositories"];
  preparationLanes?: WorkConfig["preparationLanes"];
  /** Seconds between sweeps for lost runs. Default 15; 0 turns the timer off. */
  sweepSeconds?: number;
  /** The most missed events the stream replays on reconnect. Default STREAM_REPLAY_MAX. */
  streamReplayMax?: number;
  /** Open a draft pull request when work bound to a repository checkout is accepted. Default on; CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off. */
  publishPullRequests?: boolean;
}

const OUTPUT_PATH = /^\/packages\/[^/?#]+\/(?:outputs\/|verification-evidence\/[^/?#]+\/)/;

/** Policy for agent outputs: sandboxed, no script, images and inline styles only. */
export const OUTPUT_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

const MIME: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".dxf": "application/dxf",
  ".dwg": "application/acad",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * People use a passkey session; the daemon uses its token; grant brokers use narrow
 * per-grant credentials. Package lifecycle decisions still require the kernel.
 * Grant admission does not confer human decision rights or activate a runtime.
 */
export function buildApp(opts: AppOptions): FastifyInstance {
  const ajv = loadValidator();
  const cfg: WorkConfig = { root: opts.root, ajv, guidedPreparation: opts.guidedPreparation ?? false, preparedRelease: opts.preparedRelease ?? false, ...(opts.preparationSources?{preparationSources:opts.preparationSources}:{}), ...(opts.preparationRepositories?{preparationRepositories:opts.preparationRepositories}:{}), ...(opts.preparationLanes?{preparationLanes:opts.preparationLanes}:{}), ...(opts.leaseSeconds ? { leaseSeconds: opts.leaseSeconds } : {}) };
  // Accepted work bound to a repository checkout opens its draft pull request after the accept commits.
  const resumePullRequests = opts.publishPullRequests ?? process.env.CONTROLROD_PUBLISH_PULL_REQUESTS !== "0";
  if (resumePullRequests) cfg.publish = (id, revision) => void publishAccepted(db, id, revision).catch((e) => console.error("[control-rod] pull request:", e));
  const { db, auth } = opts;
  const app = Fastify({ logger: false, bodyLimit: 150 * 1024 * 1024 });
  // Accepted work whose pull request never got an outcome is picked up once at start, not on a timer.
  if (resumePullRequests) app.addHook("onReady", async () => { void resumePublishing(db).catch((e) => console.error("[control-rod] pull request:", e)); });
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body as Buffer);
      validateRawJson(raw);
      parseJson(_req, raw, done);
    } catch {
      done(Object.assign(new Error("JSON violates the canonical record profile"), { statusCode: 400 }));
    }
  });
  app.register(cookie);
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) {
      const taught = teach(err.code);
      return reply.code(err.status).send({ code: err.code, message: err.message, change: taught.change, ...(taught.floor ? { floor: true } : {}) });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ code: "invalid", message: (err as Error).message });
    // PostgreSQL stores no U+0000 in text or jsonb. Text that carries one (a paste from a terminal or a
    // binary file) is the sender's to fix, not a server failure.
    const pgCode = (err as { code?: unknown }).code;
    if (pgCode === "22P05" || pgCode === "22021") {
      return reply.code(400).send({ code: "invalid", message: "The text contains a null character (U+0000), which cannot be stored. Remove it and try again." });
    }
    (opts.onError ?? ((e) => console.error("[control-rod] unhandled error:", e)))(err);
    return reply.code(500).send({ code: "error", message: "Something went wrong; it is in the server log." });
  });

  // Cookies ride along on requests other pages make, including pages on other localhost ports
  // (same-site), so every state-changing request must show it came from this app. Runner routes
  // use the daemon's bearer token, which a browser never sends on its own, and skip the check.
  const allowedOrigins = new Set(auth.origins);
  const secureSessionCookie = auth.origins.some((o) => {
    try {
      const u = new URL(o);
      return u.protocol === "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1";
    } catch {
      return false;
    }
  });
  app.addHook("onSend", async (_req, reply) => {
    if (!reply.hasHeader("x-content-type-options")) reply.header("x-content-type-options", "nosniff");
    if (!reply.hasHeader("x-frame-options")) reply.header("x-frame-options", "DENY");
    if (!reply.hasHeader("referrer-policy")) reply.header("referrer-policy", "no-referrer");
  });
  app.addHook("onRequest", async (req) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
    if (req.url.startsWith("/runner/")) return;
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (allowedOrigins.has(origin)) return;
    } else {
      const site = req.headers["sec-fetch-site"];
      if (site === "same-origin" || site === "none") return;
    }
    throw new Refusal(403, "cross-origin", "Refused: this request did not come from the Control Rod app");
  });

  const person = async (req: FastifyRequest): Promise<string> => {
    if (isDaemon(auth, req)) throw new Refusal(403, "forbidden", "The daemon cannot act for a person");
    const user = await sessionUser(db, req);
    if (!user) throw new Refusal(401, "signed-out", "Sign in with your passkey");
    return user;
  };
  const packageUser = async (req: FastifyRequest, id: string) => {
    const user = await person(req);
    await requireOwnPackage(db, (await callerFor(db, user)).orgId, id);
    return user;
  };
  const runUser = async (req: FastifyRequest, id: string, runId: string) => {
    const user = await person(req);
    const { orgId } = await callerFor(db, user);
    await requireOwnedRun(db, orgId, id, runId);
    return user;
  };
  const daemon = (req: FastifyRequest) => {
    if (!isDaemon(auth, req)) throw new Refusal(401, "unauthorized", "Daemon token required");
  };

  // Runs whose daemon stopped renewing its lease are retired as lost: on a timer, and before the
  // office or a claim is read so neither ever shows a dead run as working.
  // A failed sweep is logged, never silent: runs it missed are swept on the next pass.
  const sweep = () => sweepLost(db, cfg).catch((e) => (opts.onError ?? ((err) => console.error("[control-rod] sweep failed:", err)))(e));
  const sweepEvery = opts.sweepSeconds ?? 15;
  cfg.supervision = { startedAt: Date.now(), sweepSeconds: sweepEvery };
  if (sweepEvery > 0) {
    const timer = setInterval(() => void sweep(), sweepEvery * 1000);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }

  app.get("/health", async () => ({ status: "ok" as const, version: VERSION }));

  /* ---- auth ---- */
  app.get("/auth/session", async (req) => {
    const user = await sessionUser(db, req);
    return { registered: await isRegistered(db), signed_in: user !== null, ...(user ? { user } : {}) };
  });
  /** Proves a signed-in person holds one of their passkeys right now, before they add another. */
  app.post("/auth/step-up/options", async (req) => {
    const user = await sessionUser(db, req);
    if (!user) throw new Refusal(401, "unauthorized", "Sign in first");
    return { options: await assertionOptions(db, auth, "step-up", { user }, undefined, user) };
  });
  /**
   * Three ways to register a passkey: the very first one (bootstrap); a new person with an
   * administrator's invitation; or a signed-in Member adding one to their own account, signed with
   * a passkey they already hold. Nothing else registers.
   */
  app.post<{ Body: { name?: string; invitation?: string; step_up?: Record<string, unknown> } }>("/auth/register/options", async (req) => {
    if (!(await isRegistered(db))) {
      const name = String(req.body?.name ?? "owner").slice(0, 60) || "owner";
      return { options: await registrationOptions(db, auth, name, { kind: "first" }) };
    }
    if (typeof req.body?.invitation === "string") {
      const hash = createHash("sha256").update(req.body.invitation).digest("hex");
      const r = await db.query<{ user_name: string }>(
        `select m.user_name from member_invitations i join members m on m.id = i.member_id
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now() and m.body->>'status' = 'active'`, [hash]);
      if (!r.rows[0]) throw new Refusal(403, "invitation-invalid", "This invitation is not valid; ask an administrator for a new one");
      return { options: await registrationOptions(db, auth, r.rows[0].user_name, { kind: "invitation", invitation_hash: hash }) };
    }
    const user = await sessionUser(db, req);
    if (!user) throw new Refusal(403, "forbidden", "A passkey exists; sign in to add another, or use an invitation");
    if (req.body?.name !== undefined && req.body.name !== user)
      throw new Refusal(403, "own-account-only", "You can add a passkey only to your own account; an administrator invites new people");
    if (!req.body?.step_up) throw new Refusal(403, "step-up-required", "Sign with a passkey you already hold to add another");
    const ok = await assertionVerify(db, auth, "step-up", req.body.step_up as never);
    if (!ok || ok.user !== user || ok.data.user !== user) throw new Refusal(403, "step-up-failed", "That signature did not come from your account");
    return { options: await registrationOptions(db, auth, user, { kind: "additional", via: ok.credentialId }) };
  });
  app.post("/auth/register/verify", async (req, reply) => {
    let registered: { user: string; credentialId: string } | null;
    try {
      registered = await registrationVerify(db, auth, req.body as never);
    } catch (e) {
      if ((e as { code?: string }).code) throw e;
      throw new Refusal(403, "registration-refused", (e as Error).message);
    }
    if (!registered) throw new Refusal(400, "invalid", "Passkey registration failed");
    const { user, credentialId } = registered;
    await startSession(db, reply, user, credentialId, secureSessionCookie).catch(() => { throw new Refusal(403, "member-inactive", "This membership is not active"); });
    return { registered: true, signed_in: true, user };
  });
  app.post("/auth/login/options", async () => {
    if (!(await isRegistered(db))) throw new Refusal(409, "not-registered", "Register a passkey first");
    return { options: await assertionOptions(db, auth, "login", {}) };
  });
  app.post("/auth/login/verify", async (req, reply) => {
    const ok = await assertionVerify(db, auth, "login", req.body as never);
    if (!ok) throw new Refusal(401, "invalid", "Passkey sign-in failed");
    await startSession(db, reply, ok.user, ok.credentialId, secureSessionCookie).catch(() => { throw new Refusal(401, "invalid", "Passkey sign-in failed"); });
    return { registered: true, signed_in: true, user: ok.user };
  });
  app.post("/auth/logout", async (req, reply) => {
    await endSession(db, req, reply);
    return { registered: await isRegistered(db), signed_in: false };
  });

  /* ---- administration (specification 10.2) ---- */
  app.get("/admin", async (req) => {
    const caller = await callerFor(db, await person(req));
    const q = await db.query<{ body: unknown }>("select body from members where org_id = $1 order by body->>'user_name'", [caller.orgId]);
    const projects = await db.query<{ body: unknown }>("select body from projects where org_id = $1 order by body->>'name'", [caller.orgId]);
    return {
      me: caller,
      bootstrap: await needsBootstrap(db, caller.orgId),
      qualification: await currentQualification(db, caller.memberId),
      members: q.rows.map((r) => r.body),
      projects: projects.rows.map((r) => r.body),
      policy: (await currentPolicySet(db, caller.orgId))?.record ?? null,
      hardware_formats_in_force: [...((await currentPolicySet(db, caller.orgId))?.record.hardware_attestation_formats ?? DEFAULT_HARDWARE_FORMATS)],
      themes: [...bundledThemes(cfg.root).keys()].sort(),
      commands: adminCatalog(),
      actions: await adminActions(db, caller),
      // The floors (specification 11.2): no person, decision or setting lifts them.
      floors: Object.entries(REASONS).filter(([, r]) => r.floor).map(([code, r]) => ({ code, sentence: r.sentence, change: r.change })),
      // The records the administrative forms choose from (plan task 5.4).
      registry: await adminRegistry(db, { ...caller, administrator: isAdministrator(await currentQualification(db, caller.memberId)) }),
    };
  });
  app.post<{ Params: { name: string }; Body: { payload?: Record<string, unknown> } }>("/admin/commands/:name/options", async (req) => {
    const caller = await callerFor(db, await person(req));
    if (!ADMIN_COMMANDS[req.params.name]) throw new Refusal(404, "not-found", "No such administrative command");
    const payload = req.body?.payload ?? {};
    const subject = adminSubject(req.params.name, caller, payload);
    const nonce = randomBytes(16).toString("hex");
    const challenge = new Uint8Array(createHash("sha256").update(`admin|${subject}|${nonce}`).digest());
    const options = await assertionOptions(db, auth, "admin", { command: req.params.name, member: caller.memberId, subject_digest: subject, nonce }, challenge, caller.userName);
    return { subject_digest: { algorithm: "sha256", value: subject }, options };
  });
  type AdminCommandBody = { payload?: Record<string, unknown>; assertion?: Record<string, unknown> };
  async function executeAdminCommand(req: FastifyRequest<{ Body: AdminCommandBody }>, name: string, projectId?: string) {
    const user = await person(req);
    const caller = await callerFor(db, user);
    const payload = req.body?.payload ?? {};
    if (projectId !== undefined && payload.project_id !== projectId) {
      throw new Refusal(400, "invalid", "The project ID in the request must match the path");
    }
    let signed: { subject: string; credentialId: string; nonce: string; assertion: Record<string, unknown> } | null = null;
    // Presence, not truthiness: a null or false assertion is a malformed signature, never a press.
    if (req.body !== null && typeof req.body === "object" && "assertion" in req.body) {
      const ok = req.body.assertion ? await assertionVerify(db, auth, "admin", req.body.assertion as never) : null;
      if (ok && ok.user === user && ok.data.command === name && ok.data.member === caller.memberId)
        signed = { subject: String(ok.data.subject_digest), credentialId: ok.credentialId, nonce: String(ok.data.nonce), assertion: req.body.assertion };
    }
    return runAdmin(db, { root: cfg.root, ...(cfg.preparationLanes ? { preparationLanes: cfg.preparationLanes } : {}) }, name, caller, payload, signed,
      req.body !== null && typeof req.body === "object" && "assertion" in req.body && !signed);
  }
  app.post<{ Params: { name: string }; Body: AdminCommandBody }>("/admin/commands/:name", async (req) =>
    executeAdminCommand(req, req.params.name));

  preparationRoutes(app, db, cfg, (req) => packageUser(req, (req.params as { id: string }).id), auth);
  repoRoutes(app, person);
  grantRoutes(app, db, cfg, (req) => packageUser(req, (req.params as { packageId: string }).packageId));

  /* ---- workspace projects (audited project defaults & soft-archive) ---- */
  app.get("/workspace/projects", async (req) => {
    const caller = await callerFor(db, await person(req));
    return listWorkspaceProjects(db, caller.orgId);
  });
  app.post<{ Body: AdminCommandBody }>("/workspace/projects", async (req, reply) => {
    const proj = await executeAdminCommand(req, "project.workspace-create");
    return reply.code(201).send(proj);
  });
  app.patch<{ Params: { id: string }; Body: AdminCommandBody }>("/workspace/projects/:id", async (req) =>
    executeAdminCommand(req, "project.workspace-update", req.params.id));
  app.post<{ Params: { id: string }; Body: AdminCommandBody }>("/workspace/projects/:id/archive", async (req) =>
    executeAdminCommand(req, "project.workspace-archive", req.params.id));

  /* ---- captures ---- */
  app.get("/captures", async (req) => {
    const caller = await callerFor(db, await person(req));
    return listCaptures(db, caller.orgId);
  });
  app.post<{ Body: { text?: string; source?: string; lane?: string; checkout?: unknown } }>("/captures", async (req, reply) => {
    const user = await person(req);
    const source = ["web", "cli", "voice", "chat"].includes(String(req.body?.source)) ? String(req.body?.source) : "web";
    const capture = await createCapture(db, cfg, user, String(req.body?.text ?? ""), source, req.body?.lane, req.body?.checkout);
    return reply.code(201).send(capture);
  });
  app.post<{ Params: { id: string }; Body: { lane?: string } }>("/captures/:id/classify", async (req) => {
    const caller = await callerFor(db, await person(req));
    return classifyCapture(db, cfg, caller, req.params.id, req.body?.lane);
  });
  app.post<{ Params: { id: string } }>("/captures/:id/dismiss", async (req) => {
    const caller = await callerFor(db, await person(req));
    return dismissCapture(db, cfg, caller, req.params.id);
  });

  /* ---- packages ---- */
  app.get("/packages", async (req) => {
    // Scoped to the caller's organization, like the package view and its person verifications.
    const caller = await callerFor(db, await person(req));
    return listPackages(db, caller.orgId);
  });
  app.get<{ Params: { id: string } }>("/packages/:id", async (req) => {
    // Gated by the caller's organization, as the person verifications route is, since the view names
    // originators (M1 ruling 14).
    const caller = await callerFor(db, await person(req));
    await requireOwnPackage(db, caller.orgId, req.params.id);
    const view = await packageView(db, req.params.id, cfg);
    const row = await currentPackage(db, req.params.id);
    const who = row ? await originatorsInOrder(db, row) : [];
    return { ...view, originators: who, preparation_enabled: cfg.guidedPreparation };
  });
  app.put<{ Params: { id: string } }>("/packages/:id", async (req, reply) => {
    const user = await packageUser(req, req.params.id);
    const ifMatch = typeof req.headers["if-match"] === "string" ? req.headers["if-match"] : undefined;
    const saved = await updateDraft(db, cfg, user, req.params.id, req.body, ifMatch);
    return reply.header("ETag", saved.etag).header("Cache-Control", "no-store").send(saved.body);
  });
  app.get<{ Params: { id: string } }>("/packages/:id/actions", async (req) => {
    const user = await packageUser(req, req.params.id);
    return packageActions(db, cfg, user, req.params.id);
  });
  app.get<{ Params: { id: string; "*": string } }>("/packages/:id/outputs/*", async (req, reply: FastifyReply) => {
    await packageUser(req, req.params.id);
    const name = req.params["*"];
    const bytes = await packageOutput(db, req.params.id, name);
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
    const type = MIME[ext];
    reply.header("content-type", type ?? "application/octet-stream").header("x-content-type-options", "nosniff");
    const lane = await packageLane(db, req.params.id, cfg);
    if (lane) reply.header("x-controlrod-lane", lane);
    // Agent outputs are untrusted. Anything a browser could run as a document (SVG, HTML, XML)
    // is served in a sandbox with an opaque origin and no script, so it can never act with the
    // owner's session. PDFs open in the browser's own viewer, which has no access to this origin.
    if (ext !== ".pdf") reply.header("content-security-policy", OUTPUT_CSP);
    if (type === undefined) reply.header("content-disposition", "attachment");
    return reply.send(bytes);
  });
  app.get<{Params:{id:string;runId:string;"*":string}}>("/packages/:id/verification-evidence/:runId/*",async(req,reply)=>{
    await runUser(req, req.params.id, req.params.runId);
    const name=req.params["*"],bytes=await verificationEvidence(db,req.params.id,req.params.runId,name);
    const dot=name.lastIndexOf("."),ext=dot>0?name.slice(dot).toLowerCase():"",type=MIME[ext];
    reply.header("content-type",type??"application/octet-stream").header("x-content-type-options","nosniff").header("content-security-policy",OUTPUT_CSP);
    if(!type)reply.header("content-disposition","attachment");return reply.send(bytes);
  });
  app.get<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId", async (req) => {
    const caller = await callerFor(db, await person(req));
    return runDetail(db, caller.orgId, req.params.id, req.params.runId);
  });
  app.get<{ Params: { id: string; runId: string }; Querystring: RunEventQuery }>("/packages/:id/runs/:runId/events", async (req) => {
    const caller = await callerFor(db, await person(req));
    return runEvents(db, caller.orgId, req.params.id, req.params.runId, req.query);
  });
  app.get<{ Params: { id: string; runId: string }; Querystring: { after?: string } }>("/packages/:id/runs/:runId/outputs", async (req, reply) => {
    const caller = await callerFor(db, await person(req));
    reply.header("cache-control", "private, no-store");
    return runOutputs(db, caller.orgId, req.params.id, req.params.runId, req.query.after);
  });
  app.get<{ Params: { id: string; runId: string }; Querystring: { path?: string } }>("/packages/:id/runs/:runId/outputs/preview", async (req, reply) => {
    const caller = await callerFor(db, await person(req));
    reply.header("cache-control", "private, no-store");
    return runOutputPreview(db, caller.orgId, req.params.id, req.params.runId, req.query.path);
  });
  app.get<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/log", async (req) => {
    const caller = await callerFor(db, await person(req));
    return { lines: await runLogLines(db, caller.orgId, req.params.id, req.params.runId) };
  });

  interface DecisionBody {
    kind: string;
    package_revision: number;
    reason?: string;
    assertion?: Record<string, unknown>;
    expected_subject_digest?: { algorithm: string; value: string };
  }
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/packages/:id/decisions/options", async (req) => {
    const issuedTo = await packageUser(req, req.params.id);
    const { kind, package_revision: revision } = req.body ?? ({} as DecisionBody);
    const s = await decisionSubject(db, req.params.id, String(kind), Number(revision), cfg, issuedTo);
    const shown = req.body?.expected_subject_digest?.value;
    if (shown !== undefined && shown !== s.digest) {
      throw new Refusal(409, "changed", "This package changed since you opened it. Reload and review the current version.");
    }
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(
      db,
      auth,
      "decision",
      { package_id: req.params.id, kind, revision, subject_digest: s.digest, nonce },
      decisionChallenge(s.digest, String(kind), Number(revision), nonce),
      issuedTo,
    );
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/packages/:id/decisions", async (req, reply) => {
    const user = await packageUser(req, req.params.id);
    const body = req.body ?? ({} as DecisionBody);
    let signed: { subject_digest: string; assertion: Record<string, unknown>; nonce?: string } | null = null;
    const assertionSent = body !== null && typeof body === "object" && "assertion" in body;
    if (assertionSent) {
      const ok = body.assertion ? await assertionVerify(db, auth, "decision", body.assertion as never) : null;
      if (
        ok &&
        ok.user === user &&
        ok.data.package_id === req.params.id &&
        ok.data.kind === body.kind &&
        Number(ok.data.revision) === Number(body.package_revision)
      ) {
        signed = {
          subject_digest: String(ok.data.subject_digest), assertion: body.assertion as Record<string, unknown>,
          ...(typeof ok.data.nonce === "string" ? { nonce: ok.data.nonce } : {}),
        };
      }
    }
    const decision = await applyDecision(db, cfg, user, req.params.id, {
      kind: String(body.kind),
      package_revision: Number(body.package_revision),
      ...(body.reason ? { reason: String(body.reason) } : {}),
      ...(typeof body.expected_subject_digest?.value === "string" ? { expected_digest: body.expected_subject_digest.value } : {}),
      // A passkey that came and did not verify is never taken as a press: the decision is judged unsigned.
      ...(assertionSent && !signed ? { assertion_rejected: true } : {}),
    }, signed);
    return reply.code(201).send(decision);
  });

  /* ---- person verification (specification 11.5) ---- */
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/packages/:id/person-verifications/options", async (req) => {
    const issuedTo = await packageUser(req, req.params.id);
    const s = await personVerificationSubject(db, issuedTo, req.params.id, req.body);
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(db, auth, "person-verification",
      { package_id: req.params.id, revision: s.req.package_revision, subject_digest: s.digest, nonce },
      new Uint8Array(createHash("sha256").update(`${s.digest}|person-verification|${nonce}`).digest()), issuedTo);
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> & { assertion?: Record<string, unknown> } }>("/packages/:id/person-verifications", async (req, reply) => {
    const user = await packageUser(req, req.params.id);
    const { assertion, ...body } = req.body ?? {};
    let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
    if (assertion) {
      const ok = await assertionVerify(db, auth, "person-verification", assertion as never);
      if (ok && ok.user === user && ok.data.package_id === req.params.id && Number(ok.data.revision) === Number(body.package_revision))
        signed = { subject_digest: String(ok.data.subject_digest), assertion, ...(typeof ok.data.nonce === "string" ? { nonce: ok.data.nonce } : {}) };
    }
    return reply.code(201).send(await recordPersonVerification(db, user, req.params.id, body, signed));
  });

  app.post<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/stop", async (req) => {
    const user = await runUser(req, req.params.id, req.params.runId);
    return stopRun(db, cfg, user, req.params.id, req.params.runId);
  });
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string } }>(
    "/packages/:id/runs/:runId/override-independence/options",
    async (req) => {
      const issuedTo = await runUser(req, req.params.id, req.params.runId);
      const s = await overrideSubject(db, req.params.id, req.params.runId, req.body?.reason, issuedTo);
      const nonce = randomBytes(16).toString("hex");
      const options = await assertionOptions(
        db,
        auth,
        "override",
        { package_id: req.params.id, run_id: req.params.runId, revision: s.revision, reason: s.reason, subject_digest: s.digest },
        overrideChallenge(s.digest, s.revision, req.params.runId, nonce),
        issuedTo,
      );
      return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
    },
  );
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string; assertion?: Record<string, unknown> } }>(
    "/packages/:id/runs/:runId/override-independence",
    async (req) => {
      const user = await runUser(req, req.params.id, req.params.runId);
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
      if (req.body?.assertion) {
        const ok = await assertionVerify(db, auth, "override", req.body.assertion as never);
        if (ok && ok.user === user && ok.data.package_id === req.params.id && ok.data.run_id === req.params.runId && ok.data.reason === reason) {
          signed = { subject_digest: String(ok.data.subject_digest), assertion: req.body.assertion };
        }
      }
      return overrideIndependence(db, cfg, user, req.params.id, req.params.runId, reason, signed);
    },
  );
  app.get<{ Params: { id: string }; Querystring: { limit?: string; before?: string } }>("/packages/:id/checker-attempts", async (req) => {
    const caller = await callerFor(db, await person(req));
    await requireOwnPackage(db, caller.orgId, req.params.id);
    return checkerAttempts(db, req.params.id, req.query);
  });
  app.post<{ Params: { id: string } }>("/packages/:id/checks", async (req, reply) => {
    const caller = await callerFor(db, await person(req));
    await requireOwnPackage(db, caller.orgId, req.params.id);
    return reply.code(201).send(await requestCheck(db, cfg, req.params.id));
  });
  app.post<{ Params: { id: string }; Body: { reason?: string } }>("/packages/:id/recheck-overrides/options", async (req) => {
    const caller = await callerFor(db, await person(req));
    await requireOwnPackage(db, caller.orgId, req.params.id);
    const s = await recheckSubject(db, req.params.id, req.body?.reason, caller.userName);
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(
      db,
      auth,
      "recheck-override",
      { package_id: req.params.id, revision: s.revision, reason: s.reason, subject_digest: s.digest, deliverable_digest: s.deliverable },
      recheckChallenge(s.digest, s.revision, s.deliverable, nonce),
      caller.userName,
    );
    return {
      subject_digest: { algorithm: "sha256", value: s.digest },
      deliverable_digest: { algorithm: "sha256", value: s.deliverable },
      options,
    };
  });
  app.post<{ Params: { id: string }; Body: { reason?: string; assertion?: Record<string, unknown> } }>("/packages/:id/recheck-overrides", async (req) => {
    const user = await person(req);
    const caller = await callerFor(db, user);
    await requireOwnPackage(db, caller.orgId, req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
    if (req.body?.assertion) {
      const ok = await assertionVerify(db, auth, "recheck-override", req.body.assertion as never);
      if (ok && ok.user === user && ok.data.package_id === req.params.id && ok.data.reason === reason) {
        signed = { subject_digest: String(ok.data.subject_digest), assertion: req.body.assertion };
      }
    }
    return recordRecheckOverride(db, cfg, user, req.params.id, reason, signed);
  });
  /* ---- reconcile an unknown outcome (specification 22) ---- */
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string } }>("/packages/:id/runs/:runId/reconcile/options", async (req) => {
    const issuedTo = await runUser(req, req.params.id, req.params.runId);
    const s = await reconcileSubject(db, issuedTo, req.params.id, req.params.runId, req.body?.reason);
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(db, auth, "reconcile", { package_id: req.params.id, run_id: req.params.runId, subject_digest: s.digest, nonce },
      new Uint8Array(createHash("sha256").update(`${s.digest}|reconcile|${nonce}`).digest()), issuedTo);
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string; assertion?: Record<string, unknown> } }>("/packages/:id/runs/:runId/reconcile", async (req) => {
    const user = await runUser(req, req.params.id, req.params.runId);
    let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
    if (req.body?.assertion) {
      const ok = await assertionVerify(db, auth, "reconcile", req.body.assertion as never);
      if (ok && ok.user === user && ok.data.package_id === req.params.id && ok.data.run_id === req.params.runId)
        signed = { subject_digest: String(ok.data.subject_digest), assertion: req.body.assertion };
    }
    return reconcileRun(db, cfg, user, req.params.id, req.params.runId, req.body?.reason, signed);
  });

  app.post<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/requeue", async (req, reply) => {
    const user = await runUser(req, req.params.id, req.params.runId);
    return reply.code(201).send(await requeueRun(db, cfg, user, req.params.id, req.params.runId));
  });

  /** The Inbox: what waits on the viewer by gate risk then age, what waits on others, and the digest since a sequence. */
  app.get<{ Querystring: { since?: string } }>("/inbox", async (req) => {
    const user = await person(req);
    await sweep();
    const raw = req.query.since;
    return inbox(db, cfg, user, raw === undefined || raw === "" ? undefined : Number(raw));
  });
  app.get("/office", async (req) => {
    // Scoped to the caller's organization, like the package list and views.
    const caller = await callerFor(db, await person(req));
    await sweep();
    return office(db, caller.orgId);
  });
  /** The office floor for the viewer: one AgentFigure per agent, from recorded data only (plan task 4.6). */
  app.get<{ Querystring: { presenting?: string } }>("/office/figures", async (req) => {
    const user = await person(req);
    await sweep();
    return officeFigures(db, cfg, user, req.query.presenting === "true");
  });
  /** A SCRAM, its stopped runs and every quarantine batch with digests, for the people reviewing it. */
  app.get<{ Querystring: { presenting?: string } }>("/scrams", async (req) => {
    const caller = await callerFor(db, await person(req));
    return activeScramsFor(db, caller.orgId, req.query.presenting === "true");
  });
  /** What pulling SCRAM with a scope would stop now, by the pull's own selection (OV-12). */
  app.get<{ Querystring: { scope?: string; project_id?: string; presenting?: string } }>("/scrams/preview", async (req) => {
    const caller = await callerFor(db, await person(req));
    return scramPreview(db, caller.orgId, req.query, req.query.presenting === "true");
  });
  app.get<{ Params: { id: string } }>("/scrams/:id", async (req) => {
    const caller = await callerFor(db, await person(req));
    return scramView(db, caller.orgId, req.params.id);
  });
  /** The Roster: roles, baselines as recorded on runs, versions a pin may name, and sandboxes as launched (plan task 5.1). */
  app.get("/roster", async (req) => {
    const caller = await callerFor(db, await person(req));
    return roster(db, caller.orgId);
  });
  /** The record verified: the chain, each seal checked again, and what no seal covers yet (plan task 5.3). */
  app.get("/records/verify", async (req) => {
    const caller = await callerFor(db, await person(req));
    return verifyRecords(db, auth, caller.orgId);
  });
  /** The head a seal made now would cover, for the screen to show and the signature to name. */
  app.get("/records/head", async (req) => {
    await callerFor(db, await person(req));
    return { head: await chainHead(db) };
  });
  /** A package's inclusion proof: the chain segment holding its events, up to the seal that covers them. */
  app.get<{ Params: { id: string } }>("/packages/:id/proof", async (req) => {
    const caller = await callerFor(db, await person(req));
    // The bundle is self contained; the control plane's own checks of it and of the whole chain travel beside it.
    return inclusionProof(db, auth, caller.orgId, req.params.id);
  });
  /** An audit export: every event recorded in a time window, up to the seal that covers them. */
  app.get<{ Querystring: { from?: string; to?: string } }>("/records/export", async (req) => {
    const caller = await callerFor(db, await person(req));
    return windowExport(db, auth, caller.orgId, req.query.from, req.query.to);
  });
  /** A package's recorded person verifications, every revision, oldest first. */
  app.get<{ Params: { id: string } }>("/packages/:id/person-verifications", async (req) => {
    const caller = await callerFor(db, await person(req));
    return listPersonVerifications(db, caller.orgId, req.params.id);
  });
  /** Budgets with their use this window, the latest usage records, and which runtimes report tokens (plan task 5.2). */
  app.get("/usage", async (req) => {
    const caller = await callerFor(db, await person(req));
    await sweep();
    return usageView(db, caller.orgId);
  });
  app.get("/runtimes", async (req) => {
    return { ...(await runtimeStatus(db, (await callerFor(db, await person(req))).orgId)), ...(await agentUpdateView(db)) };
  });
  app.get("/update-notice", async (req) => {
    await callerFor(db, await person(req));
    return (await opts.updateNotice?.read()) ?? null;
  });
  app.post("/update-notice/check", async (req) => {
    await callerFor(db, await person(req));
    return (await opts.updateNotice?.check()) ?? null;
  });
  /** First-run setup: which agents are seated and when to check with the person. */
  app.get("/setup", async (req) => {
    await callerFor(db, await person(req));
    return setupView(db);
  });
  app.put("/setup", async (req) => {
    const caller = await callerFor(db, await person(req));
    return recordSetup(db, caller, req.body);
  });
  /** One Agents roster switch: that seat only. */
  app.put<{ Params: { runtime: string } }>("/setup/seats/:runtime", async (req) => {
    const caller = await callerFor(db, await person(req));
    return recordSeat(db, caller, req.params.runtime, req.body);
  });
  /** Provider CLIs the daemon probed. Read-only. No token is accepted or returned. */
  app.get("/subscriptions", async (req) => {
    return subscriptionView(db, (await callerFor(db, await person(req))).orgId);
  });
  /** Usage-limit readings the agent CLIs reported, for the control room. Read-only; no token. */
  app.get("/usage/limits", async (req) => {
    await callerFor(db, await person(req));
    return usageLimitsView(db);
  });
  app.get("/runs", async (req) => {
    const caller = await callerFor(db, await person(req));
    return activeRuns(db, caller.orgId);
  });
  app.get("/runs/active", async (req) => {
    const caller = await callerFor(db, await person(req));
    return activeRunSummaries(db, caller.orgId);
  });
  app.get("/metrics", async (req) => {
    const caller = await callerFor(db, await person(req));
    return metrics(db, caller.orgId);
  });

  /* ---- events ---- */
  app.get<{ Querystring: { after?: string } }>("/events", async (req) => {
    const caller = await callerFor(db, await person(req));
    const after = Number(req.query.after ?? 0) || 0;
    return listEvents(db, caller.orgId, Number.isSafeInteger(after) && after >= 0 ? after : 0);
  });
  app.get("/events/verify", async (req) => {
    const caller = await callerFor(db, await person(req));
    return verifyOrganizationEvents(db, caller.orgId);
  });
  /**
   * The event stream (specification 27). Durable frames are chain events, each with its sequence as
   * the SSE id, so a client that reconnects with Last-Event-ID (or ?after=) receives what it missed,
   * in order. A new connection first gets a checkpoint frame carrying the head id, so even a client
   * that has seen no event yet reconnects from a known place. When history cannot be replayed (too
   * far behind, or a sequence this chain never reached) the stream says so with a loss frame and the
   * client refreshes. Heartbeats are transient frames with no id.
   *
   * Frames are always read from the event table in sequence order. Appends hold an exclusive table
   * lock until commit, so committed sequences have no gaps; the in-process bus only wakes the
   * reader, because commit notifications from separate connections can arrive out of order.
   */
  const replayMax = opts.streamReplayMax ?? STREAM_REPLAY_MAX;
  app.get<{ Querystring: { after?: string } }>("/events/stream", async (req, reply) => {
    const caller = await callerFor(db, await person(req));
    const raw = req.headers["last-event-id"] ?? req.query.after;
    const after = raw === undefined || raw === "" ? undefined : Number(raw);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    let lastSent = 0;
    let ready = false;
    let closed = false;
    let draining = false;
    let again = false;
    // Sends every visible committed event after lastSent, in order. One drain runs at a time; a wakeup
    // during a drain makes it look again before it stops.
    const drain = async () => {
      if (!ready || closed) return;
      if (draining) {
        again = true;
        return;
      }
      draining = true;
      try {
        do {
          again = false;
          for (;;) {
            const events = await listEvents(db, caller.orgId, lastSent);
            if (closed || res.destroyed) return;
            for (const event of events) {
              lastSent = event.seq;
              if (closed || res.destroyed) return;
              res.write(`id: ${event.seq}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`);
            }
            if (events.length < 500) break;
          }
        } while (again && !closed);
      } catch (e) {
        app.log.warn({ err: e }, "event stream read failed; closing the stream");
        closed = true;
        res.end();
      } finally {
        draining = false;
      }
    };
    // Subscribe before reading the head, so nothing committed meanwhile is missed: any wakeup that
    // arrives before the head is known is honoured by the first drain.
    const onEvent = () => void drain();
    bus.on("event", onEvent);
    const ping = setInterval(() => {
      if (closed || res.destroyed) return;
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 15000);
    const cleanup = () => {
      closed = true;
      clearInterval(ping);
      bus.off("event", onEvent);
    };
    req.raw.on("close", cleanup);
    try {
      const { head, pending } = await eventPosition(db, caller.orgId, after, replayMax + 1);
      if (closed || res.destroyed) return;
      if (after !== undefined) {
        const valid = Number.isInteger(after) && after >= 0 && after <= head;
        if (!valid || pending > replayMax) {
          res.write(`id: ${head}\nevent: loss\ndata: ${JSON.stringify({ after: raw, resume_from: head, reason: valid ? "too far behind to replay" : "no such position in this event log" })}\n\n`);
          lastSent = head;
        } else {
          lastSent = after;
        }
      } else {
        res.write(`id: ${head}\nevent: checkpoint\ndata: ${JSON.stringify({ head })}\n\n`);
        lastSent = head;
      }
      ready = true;
      await drain();
    } catch (e) {
      cleanup();
      app.log.warn({ err: e }, "event stream initialization failed; closing the stream");
      if (!res.destroyed) res.end();
    }
  });

  /* ---- runner ---- */
  app.post<{ Body: { runtimes?: string[]; runtime_status?: unknown; run_ceiling_seconds?: unknown; subscription_report?: unknown; supports_checkouts?: unknown; usage_limits?: unknown; agent_updates?: unknown; agent_updates_unchecked?: unknown } }>("/runner/claim", async (req, reply) => {
    daemon(req);
    if (req.body?.agent_updates !== undefined) await recordAgentUpdates(db, req.body.agent_updates, req.body.agent_updates_unchecked);
    // Only runtimes the daemon's probe found ready are picked; a runtime reported not ready is
    // left out even if it is also listed.
    const status = await recordRuntimeStatus(db, req.body?.runtime_status);
    if (req.body?.subscription_report !== undefined) await recordSubscriptionReport(db, req.body.subscription_report);
    if (req.body?.usage_limits !== undefined) await recordUsageLimits(db, req.body.usage_limits);
    const notReady = new Set(status.filter((s) => !s.ready).map((s) => s.runtime));
    const artifacts = new Map(status.filter((s) => s.artifact).map((s) => [s.runtime, s.artifact!.digest.value]));
    const runtimes = (Array.isArray(req.body?.runtimes) ? req.body.runtimes : [])
      .map(String)
      .filter((r) => ["claude", "codex", "fake"].includes(r) && !notReady.has(r));
    await sweep();
    // The daemon's run ceiling sizes budget reservations; one it did not report is never guessed.
    const ceiling = req.body?.run_ceiling_seconds;
    const reportedModels = new Map(status.filter((s) => s.ready && s.models).map((s) => [s.runtime, s.models!]));
    const job = await claim(
      db, cfg, runtimes, artifacts, Number.isInteger(ceiling) && (ceiling as number) > 0 ? (ceiling as number) : undefined, reportedModels,
      req.body?.supports_checkouts === true,
    );
    if (!job) return reply.code(204).send();
    return job;
  });
  app.post<{ Params: { id: string }; Body: { claim_token?: string; lines?: string[]; label?: string; receipt?: unknown; events?: unknown; events_from?: unknown } }>("/runner/runs/:id/log", async (req) => {
    daemon(req);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines.map(String) : [];
    return runLog(db, cfg, req.params.id, req.body?.claim_token, lines, req.body?.label ? String(req.body.label) : undefined, req.body?.receipt, req.body?.events, req.body?.events_from);
  });
  app.post<{ Params: { id: string } }>("/runner/runs/:id/evidence", async (req) => {
    daemon(req);
    return runEvidence(db, cfg, req.params.id, req.body ?? {});
  });
  app.post<{ Params: { id: string } }>("/runner/runs/:id/complete", async (req) => {
    daemon(req);
    return complete(db, cfg, req.params.id, req.body ?? {});
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    // The app's pages share paths with the API (/office, /packages/:id). A browser navigation asks
    // for HTML first; it gets the app, and the app's own fetches get JSON.
    app.addHook("onRequest", async (req, reply) => {
      const accept = req.headers.accept ?? "";
      // Output links open the file itself, never the app.
      if (req.method === "GET" && accept.startsWith("text/html") && req.url !== "/health" && !OUTPUT_PATH.test(req.url)) {
        return reply.type("text/html").sendFile("index.html");
      }
    });
    app.register(fastifyStatic, { root: opts.webDir, prefix: "/", wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && req.headers.accept?.includes("text/html")) return reply.sendFile("index.html");
      return reply.code(404).send({ code: "not-found", message: "Not found" });
    });
  }

  return app;
}
