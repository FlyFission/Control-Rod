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
import { bus, type EventRecord, listEvents, verifyChain } from "./events.js";
import { verificationEvidence } from "./preparation/results.js";
import { grantRoutes } from "./preparation/grant-routes.js";
import { preparationRoutes } from "./preparation/routes.js";
import { validateRawJson } from "./kernel.js";
import { loadValidator } from "./schemas.js";
import { REASONS, teach } from "./refusals.js";
import { personVerificationSubject, recordPersonVerification } from "./person-verification.js";
import { inbox } from "./inbox.js";
import { officeFigures } from "./figures.js";
import { activeScramsFor, scramPreview, scramView } from "./scram.js";
import { roster } from "./roster.js";
import { chainHead, inclusionProof, verifyRecords } from "./seals.js";
import { ADMIN_COMMANDS, adminActions, adminCatalog, adminSubject, bundledThemes, callerFor, needsBootstrap, runAdmin } from "./admin.js";
import { currentPolicySet, currentQualification } from "./tenancy.js";
import {
  Refusal,
  type WorkConfig,
  applyDecision,
  claim,
  complete,
  classifyCapture,
  createCapture,
  decisionChallenge,
  decisionSubject,
  listCaptures,
  activeRuns,
  listPackages,
  metrics,
  office,
  overrideChallenge,
  overrideIndependence,
  overrideSubject,
  packageActions,
  packageLane,
  packageOutput,
  packageView,
  recordRuntimeStatus,
  requeueRun,
  runLog,
  runLogLines,
  runtimeStatus,
  stopRun,
  sweepLost,
  runEvidence,
  runEvents,
  reconcileSubject,
  reconcileRun,
  updateDraft,
} from "./work.js";

export const VERSION = "0.1.0";

/** The most missed events the stream replays on reconnect; further behind gets a loss frame. */
export const STREAM_REPLAY_MAX = 5000;

export interface AppOptions {
  db: Db;
  /** Where unhandled errors are reported. Default: one line on standard error with the stack. */
  onError?: (err: unknown) => void;
  auth: AuthConfig;
  root: string;
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
  const { db, auth } = opts;
  const app = Fastify({ logger: false, bodyLimit: 150 * 1024 * 1024 });
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
    (opts.onError ?? ((e) => console.error("[control-rod] unhandled error:", e)))(err);
    return reply.code(500).send({ code: "error", message: "Something went wrong; it is in the server log." });
  });

  // Cookies ride along on requests other pages make, including pages on other localhost ports
  // (same-site), so every state-changing request must show it came from this app. Runner routes
  // use the daemon's bearer token, which a browser never sends on its own, and skip the check.
  const allowedOrigins = new Set(auth.origins);
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
    let user: string | null;
    try {
      user = await registrationVerify(db, auth, req.body as never);
    } catch (e) {
      if ((e as { code?: string }).code) throw e;
      throw new Refusal(403, "registration-refused", (e as Error).message);
    }
    if (!user) throw new Refusal(400, "invalid", "Passkey registration failed");
    await startSession(db, reply, user).catch(() => { throw new Refusal(403, "member-inactive", "This membership is not active"); });
    return { registered: true, signed_in: true, user };
  });
  app.post("/auth/login/options", async () => {
    if (!(await isRegistered(db))) throw new Refusal(409, "not-registered", "Register a passkey first");
    return { options: await assertionOptions(db, auth, "login", {}) };
  });
  app.post("/auth/login/verify", async (req, reply) => {
    const ok = await assertionVerify(db, auth, "login", req.body as never);
    if (!ok) throw new Refusal(401, "invalid", "Passkey sign-in failed");
    await startSession(db, reply, ok.user).catch(() => { throw new Refusal(401, "invalid", "Passkey sign-in failed"); });
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
      themes: [...bundledThemes(cfg.root).keys()].sort(),
      commands: adminCatalog(),
      actions: await adminActions(db, caller),
      // The floors (specification 11.2): no person, decision or setting lifts them.
      floors: Object.entries(REASONS).filter(([, r]) => r.floor).map(([code, r]) => ({ code, sentence: r.sentence, change: r.change })),
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
  app.post<{ Params: { name: string }; Body: { payload?: Record<string, unknown>; assertion?: Record<string, unknown> } }>("/admin/commands/:name", async (req) => {
    const user = await person(req);
    const caller = await callerFor(db, user);
    let signed: { subject: string; credentialId: string; nonce: string; assertion: Record<string, unknown> } | null = null;
    if (req.body?.assertion) {
      const ok = await assertionVerify(db, auth, "admin", req.body.assertion as never);
      if (ok && ok.user === user && ok.data.command === req.params.name && ok.data.member === caller.memberId)
        signed = { subject: String(ok.data.subject_digest), credentialId: ok.credentialId, nonce: String(ok.data.nonce), assertion: req.body.assertion };
    }
    return runAdmin(db, { root: cfg.root, ...(cfg.preparationLanes ? { preparationLanes: cfg.preparationLanes } : {}) }, req.params.name, caller, req.body?.payload ?? {}, signed);
  });

  preparationRoutes(app, db, cfg, person, auth);
  grantRoutes(app,db,cfg,person);

  /* ---- captures ---- */
  app.get("/captures", async (req) => {
    await person(req);
    return listCaptures(db);
  });
  app.post<{ Body: { text?: string; source?: string; lane?: string } }>("/captures", async (req, reply) => {
    const user = await person(req);
    const source = ["web", "cli", "voice", "chat"].includes(String(req.body?.source)) ? String(req.body?.source) : "web";
    const capture = await createCapture(db, cfg, user, String(req.body?.text ?? ""), source, req.body?.lane);
    return reply.code(201).send(capture);
  });
  app.post<{ Params: { id: string }; Body: { lane?: string } }>("/captures/:id/classify", async (req) => {
    const user = await person(req);
    return classifyCapture(db, cfg, user, req.params.id, req.body?.lane);
  });

  /* ---- packages ---- */
  app.get("/packages", async (req) => {
    await person(req);
    return listPackages(db);
  });
  app.get<{ Params: { id: string } }>("/packages/:id", async (req) => {
    await person(req);
    return { ...await packageView(db, req.params.id, cfg), preparation_enabled: cfg.guidedPreparation };
  });
  app.put<{ Params: { id: string } }>("/packages/:id", async (req, reply) => {
    const user = await person(req);
    const ifMatch = typeof req.headers["if-match"] === "string" ? req.headers["if-match"] : undefined;
    const saved = await updateDraft(db, cfg, user, req.params.id, req.body, ifMatch);
    return reply.header("ETag", saved.etag).header("Cache-Control", "no-store").send(saved.body);
  });
  app.get<{ Params: { id: string } }>("/packages/:id/actions", async (req) => {
    const user = await person(req);
    return packageActions(db, cfg, user, req.params.id);
  });
  app.get<{ Params: { id: string; "*": string } }>("/packages/:id/outputs/*", async (req, reply: FastifyReply) => {
    await person(req);
    const name = req.params["*"];
    const bytes = await packageOutput(db, req.params.id, name);
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const type = MIME[ext];
    reply.header("content-type", type ?? "application/octet-stream").header("x-content-type-options", "nosniff");
    const lane = await packageLane(db, req.params.id);
    if (lane) reply.header("x-controlrod-lane", lane);
    // Agent outputs are untrusted. Anything a browser could run as a document (SVG, HTML, XML)
    // is served in a sandbox with an opaque origin and no script, so it can never act with the
    // owner's session. PDFs open in the browser's own viewer, which has no access to this origin.
    if (ext !== ".pdf") reply.header("content-security-policy", OUTPUT_CSP);
    if (type === undefined) reply.header("content-disposition", "attachment");
    return reply.send(bytes);
  });
  app.get<{Params:{id:string;runId:string;"*":string}}>("/packages/:id/verification-evidence/:runId/*",async(req,reply)=>{
    await person(req);const name=req.params["*"],bytes=await verificationEvidence(db,req.params.id,req.params.runId,name);
    const ext=name.slice(name.lastIndexOf(".")).toLowerCase(),type=MIME[ext];
    reply.header("content-type",type??"application/octet-stream").header("x-content-type-options","nosniff").header("content-security-policy",OUTPUT_CSP);
    if(!type)reply.header("content-disposition","attachment");return reply.send(bytes);
  });
  app.get<{ Params: { id: string; runId: string }; Querystring: { after?: string } }>("/packages/:id/runs/:runId/events", async (req) => {
    await person(req);
    return runEvents(db, req.params.id, req.params.runId, Number(req.query.after ?? 0) || 0);
  });
  app.get<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/log", async (req) => {
    await person(req);
    return { lines: await runLogLines(db, req.params.id, req.params.runId) };
  });

  interface DecisionBody {
    kind: string;
    package_revision: number;
    reason?: string;
    assertion?: Record<string, unknown>;
    expected_subject_digest?: { algorithm: string; value: string };
  }
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/packages/:id/decisions/options", async (req) => {
    const issuedTo = await person(req);
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
    const user = await person(req);
    const body = req.body ?? ({} as DecisionBody);
    let signed: { subject_digest: string; assertion: Record<string, unknown>; nonce?: string } | null = null;
    if (body.assertion) {
      const ok = await assertionVerify(db, auth, "decision", body.assertion as never);
      if (
        ok &&
        ok.user === user &&
        ok.data.package_id === req.params.id &&
        ok.data.kind === body.kind &&
        Number(ok.data.revision) === Number(body.package_revision)
      ) {
        signed = {
          subject_digest: String(ok.data.subject_digest), assertion: body.assertion,
          ...(typeof ok.data.nonce === "string" ? { nonce: ok.data.nonce } : {}),
        };
      }
    }
    const decision = await applyDecision(db, cfg, user, req.params.id, {
      kind: String(body.kind),
      package_revision: Number(body.package_revision),
      ...(body.reason ? { reason: String(body.reason) } : {}),
    }, signed);
    return reply.code(201).send(decision);
  });

  /* ---- person verification (specification 11.5) ---- */
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/packages/:id/person-verifications/options", async (req) => {
    const issuedTo = await person(req);
    const s = await personVerificationSubject(db, issuedTo, req.params.id, req.body);
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(db, auth, "person-verification",
      { package_id: req.params.id, revision: s.req.package_revision, subject_digest: s.digest, nonce },
      new Uint8Array(createHash("sha256").update(`${s.digest}|person-verification|${nonce}`).digest()), issuedTo);
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> & { assertion?: Record<string, unknown> } }>("/packages/:id/person-verifications", async (req, reply) => {
    const user = await person(req);
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
    const user = await person(req);
    return stopRun(db, cfg, user, req.params.id, req.params.runId);
  });
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string } }>(
    "/packages/:id/runs/:runId/override-independence/options",
    async (req) => {
      const issuedTo = await person(req);
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
      const user = await person(req);
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
  /* ---- reconcile an unknown outcome (specification 22) ---- */
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string } }>("/packages/:id/runs/:runId/reconcile/options", async (req) => {
    const issuedTo = await person(req);
    const s = await reconcileSubject(db, issuedTo, req.params.id, req.params.runId, req.body?.reason);
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(db, auth, "reconcile", { package_id: req.params.id, run_id: req.params.runId, subject_digest: s.digest, nonce },
      new Uint8Array(createHash("sha256").update(`${s.digest}|reconcile|${nonce}`).digest()), issuedTo);
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string; assertion?: Record<string, unknown> } }>("/packages/:id/runs/:runId/reconcile", async (req) => {
    const user = await person(req);
    let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
    if (req.body?.assertion) {
      const ok = await assertionVerify(db, auth, "reconcile", req.body.assertion as never);
      if (ok && ok.user === user && ok.data.package_id === req.params.id && ok.data.run_id === req.params.runId)
        signed = { subject_digest: String(ok.data.subject_digest), assertion: req.body.assertion };
    }
    return reconcileRun(db, cfg, user, req.params.id, req.params.runId, req.body?.reason, signed);
  });

  app.post<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/requeue", async (req, reply) => {
    const user = await person(req);
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
    await person(req);
    await sweep();
    return office(db);
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
    await person(req);
    return { head: await chainHead(db) };
  });
  /** A package's inclusion proof: the chain segment holding its events, up to the seal that covers them. */
  app.get<{ Params: { id: string } }>("/packages/:id/proof", async (req) => {
    const caller = await callerFor(db, await person(req));
    // The bundle is self contained; the control plane's own checks of it and of the whole chain travel beside it.
    return inclusionProof(db, auth, caller.orgId, req.params.id);
  });
  app.get("/runtimes", async (req) => {
    await person(req);
    return runtimeStatus(db);
  });
  app.get("/runs", async (req) => {
    await person(req);
    return activeRuns(db);
  });
  app.get("/metrics", async (req) => {
    await person(req);
    return metrics(db);
  });

  /* ---- events ---- */
  app.get<{ Querystring: { after?: string } }>("/events", async (req) => {
    await person(req);
    return listEvents(db, Number(req.query.after ?? 0) || 0);
  });
  app.get("/events/verify", async (req) => {
    await person(req);
    return verifyChain(db);
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
    await person(req);
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
    // Sends every committed event after lastSent, in order. One drain runs at a time; a wakeup
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
            const rows = (await db.query<{ body: EventRecord }>("select body from events where seq > $1 order by seq limit 500", [lastSent])).rows;
            if (closed) return;
            for (const r of rows) {
              lastSent = r.body.seq;
              res.write(`id: ${r.body.seq}\nevent: event\ndata: ${JSON.stringify(r.body)}\n\n`);
            }
            if (rows.length < 500) break;
          }
        } while (again && !closed);
      } catch (e) {
        app.log.warn({ err: e }, "event stream read failed; closing the stream");
        res.end();
      } finally {
        draining = false;
      }
    };
    // Subscribe before reading the head, so nothing committed meanwhile is missed: any wakeup that
    // arrives before the head is known is honoured by the first drain.
    const onEvent = () => void drain();
    bus.on("event", onEvent);
    const ping = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`), 15000);
    req.raw.on("close", () => {
      closed = true;
      clearInterval(ping);
      bus.off("event", onEvent);
    });
    const head = (await db.query<{ n: number }>("select coalesce(max(seq), 0)::int as n from events")).rows[0]!.n;
    if (after !== undefined) {
      const valid = Number.isInteger(after) && after >= 0 && after <= head;
      if (!valid || head - after > replayMax) {
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
  });

  /* ---- runner ---- */
  app.post<{ Body: { runtimes?: string[]; runtime_status?: unknown } }>("/runner/claim", async (req, reply) => {
    daemon(req);
    // Only runtimes the daemon's probe found ready are picked; a runtime reported not ready is
    // left out even if it is also listed.
    const status = await recordRuntimeStatus(db, req.body?.runtime_status);
    const notReady = new Set(status.filter((s) => !s.ready).map((s) => s.runtime));
    const artifacts = new Map(status.filter((s) => s.artifact).map((s) => [s.runtime, s.artifact!.digest.value]));
    const runtimes = (Array.isArray(req.body?.runtimes) ? req.body.runtimes : [])
      .map(String)
      .filter((r) => ["claude", "codex", "fake"].includes(r) && !notReady.has(r));
    await sweep();
    const job = await claim(db, cfg, runtimes, artifacts);
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
