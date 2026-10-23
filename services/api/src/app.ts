import { randomBytes } from "node:crypto";
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
import { preparationRoutes } from "./preparation/routes.js";
import { validateRawJson } from "./kernel.js";
import { loadValidator } from "./schemas.js";
import {
  Refusal,
  type WorkConfig,
  applyDecision,
  claim,
  complete,
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
  packageOutput,
  packageView,
  recordRuntimeStatus,
  requeueRun,
  runLog,
  runLogLines,
  runtimeStatus,
  stopRun,
  sweepLost,
  updateDraft,
} from "./work.js";

export const VERSION = "0.1.0";

export interface AppOptions {
  db: Db;
  auth: AuthConfig;
  root: string;
  /** Built web app to serve at /, if present. */
  webDir?: string;
  /** Seconds a run claim lasts without a heartbeat. Default 90. */
  leaseSeconds?: number;
  /** Enables new enrollment; existing companions stay controlled when off. */
  guidedPreparation?: boolean;
  /** Seconds between sweeps for lost runs. Default 15; 0 turns the timer off. */
  sweepSeconds?: number;
}

const OUTPUT_PATH = /^\/packages\/[^/?#]+\/outputs\//;

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
 * The control plane. People act through a passkey session; the daemon acts through its token.
 * Neither can use the other's routes, and every state change goes through the kernel.
 */
export function buildApp(opts: AppOptions): FastifyInstance {
  const ajv = loadValidator();
  const cfg: WorkConfig = { root: opts.root, ajv, guidedPreparation: opts.guidedPreparation ?? false, ...(opts.leaseSeconds ? { leaseSeconds: opts.leaseSeconds } : {}) };
  const { db, auth } = opts;
  const app = Fastify({ logger: false, bodyLimit: 150 * 1024 * 1024 });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body as Buffer);
      validateRawJson(raw);
      done(null, JSON.parse(raw));
    } catch {
      done(Object.assign(new Error("JSON violates the canonical record profile"), { statusCode: 400 }));
    }
  });
  app.register(cookie);
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) return reply.code(err.status).send({ code: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ code: "invalid", message: (err as Error).message });
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
  const sweep = () => sweepLost(db, cfg).catch(() => undefined);
  const sweepEvery = opts.sweepSeconds ?? 15;
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
  app.post<{ Body: { name?: string } }>("/auth/register/options", async (req) => {
    if ((await isRegistered(db)) && !(await sessionUser(db, req))) {
      throw new Refusal(403, "forbidden", "A passkey exists; sign in to add another");
    }
    const name = String(req.body?.name ?? "owner").slice(0, 60) || "owner";
    return { options: await registrationOptions(db, auth, name) };
  });
  app.post("/auth/register/verify", async (req, reply) => {
    const user = await registrationVerify(db, auth, req.body as never);
    if (!user) throw new Refusal(400, "invalid", "Passkey registration failed");
    await startSession(db, reply, user);
    return { registered: true, signed_in: true, user };
  });
  app.post("/auth/login/options", async () => {
    if (!(await isRegistered(db))) throw new Refusal(409, "not-registered", "Register a passkey first");
    return { options: await assertionOptions(db, auth, "login", {}) };
  });
  app.post("/auth/login/verify", async (req, reply) => {
    const ok = await assertionVerify(db, auth, "login", req.body as never);
    if (!ok) throw new Refusal(401, "invalid", "Passkey sign-in failed");
    await startSession(db, reply, ok.user);
    return { registered: true, signed_in: true, user: ok.user };
  });
  app.post("/auth/logout", async (req, reply) => {
    await endSession(db, req, reply);
    return { registered: await isRegistered(db), signed_in: false };
  });

  preparationRoutes(app, db, cfg, person, auth);

  /* ---- captures ---- */
  app.get("/captures", async (req) => {
    await person(req);
    return listCaptures(db);
  });
  app.post<{ Body: { text?: string; source?: string } }>("/captures", async (req, reply) => {
    const user = await person(req);
    const source = ["web", "cli", "voice", "chat"].includes(String(req.body?.source)) ? String(req.body?.source) : "web";
    const capture = await createCapture(db, cfg, user, String(req.body?.text ?? ""), source);
    return reply.code(201).send(capture);
  });

  /* ---- packages ---- */
  app.get("/packages", async (req) => {
    await person(req);
    return listPackages(db);
  });
  app.get<{ Params: { id: string } }>("/packages/:id", async (req) => {
    await person(req);
    return { ...await packageView(db, req.params.id), preparation_enabled: cfg.guidedPreparation };
  });
  app.put<{ Params: { id: string } }>("/packages/:id", async (req) => {
    const user = await person(req);
    return updateDraft(db, cfg, user, req.params.id, req.body);
  });
  app.get<{ Params: { id: string; "*": string } }>("/packages/:id/outputs/*", async (req, reply: FastifyReply) => {
    await person(req);
    const name = req.params["*"];
    const bytes = await packageOutput(db, req.params.id, name);
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const type = MIME[ext];
    reply.header("content-type", type ?? "application/octet-stream").header("x-content-type-options", "nosniff");
    // Agent outputs are untrusted. Anything a browser could run as a document (SVG, HTML, XML)
    // is served in a sandbox with an opaque origin and no script, so it can never act with the
    // owner's session. PDFs open in the browser's own viewer, which has no access to this origin.
    if (ext !== ".pdf") reply.header("content-security-policy", OUTPUT_CSP);
    if (type === undefined) reply.header("content-disposition", "attachment");
    return reply.send(bytes);
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
    await person(req);
    const { kind, package_revision: revision } = req.body ?? ({} as DecisionBody);
    const s = await decisionSubject(db, req.params.id, String(kind), Number(revision));
    const shown = req.body?.expected_subject_digest?.value;
    if (shown !== undefined && shown !== s.digest) {
      throw new Refusal(409, "changed", "This package changed since you opened it. Reload and review the current version.");
    }
    const nonce = randomBytes(16).toString("hex");
    const options = await assertionOptions(
      db,
      auth,
      "decision",
      { package_id: req.params.id, kind, revision, subject_digest: s.digest },
      decisionChallenge(s.digest, String(kind), Number(revision), nonce),
    );
    return { subject_digest: { algorithm: "sha256", value: s.digest }, options };
  });
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/packages/:id/decisions", async (req, reply) => {
    const user = await person(req);
    const body = req.body ?? ({} as DecisionBody);
    let signed: { subject_digest: string; assertion: Record<string, unknown> } | null = null;
    if (body.assertion) {
      const ok = await assertionVerify(db, auth, "decision", body.assertion as never);
      if (
        ok &&
        ok.user === user &&
        ok.data.package_id === req.params.id &&
        ok.data.kind === body.kind &&
        Number(ok.data.revision) === Number(body.package_revision)
      ) {
        signed = { subject_digest: String(ok.data.subject_digest), assertion: body.assertion };
      }
    }
    const decision = await applyDecision(db, cfg, user, req.params.id, {
      kind: String(body.kind),
      package_revision: Number(body.package_revision),
      ...(body.reason ? { reason: String(body.reason) } : {}),
    }, signed);
    return reply.code(201).send(decision);
  });

  app.post<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/stop", async (req) => {
    const user = await person(req);
    return stopRun(db, cfg, user, req.params.id, req.params.runId);
  });
  app.post<{ Params: { id: string; runId: string }; Body: { reason?: string } }>(
    "/packages/:id/runs/:runId/override-independence/options",
    async (req) => {
      await person(req);
      const s = await overrideSubject(db, req.params.id, req.params.runId, req.body?.reason);
      const nonce = randomBytes(16).toString("hex");
      const options = await assertionOptions(
        db,
        auth,
        "override",
        { package_id: req.params.id, run_id: req.params.runId, revision: s.revision, reason: s.reason, subject_digest: s.digest },
        overrideChallenge(s.digest, s.revision, req.params.runId, nonce),
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
  app.post<{ Params: { id: string; runId: string } }>("/packages/:id/runs/:runId/requeue", async (req, reply) => {
    const user = await person(req);
    return reply.code(201).send(await requeueRun(db, cfg, user, req.params.id, req.params.runId));
  });

  app.get("/office", async (req) => {
    await person(req);
    await sweep();
    return office(db);
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
  app.get("/events/stream", async (req, reply) => {
    await person(req);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    const send = (e: EventRecord) => res.write(`event: event\ndata: ${JSON.stringify(e)}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    bus.on("event", send);
    req.raw.on("close", () => {
      clearInterval(ping);
      bus.off("event", send);
    });
  });

  /* ---- runner ---- */
  app.post<{ Body: { runtimes?: string[]; runtime_status?: unknown } }>("/runner/claim", async (req, reply) => {
    daemon(req);
    // Only runtimes the daemon's probe found ready are picked; a runtime reported not ready is
    // left out even if it is also listed.
    const status = await recordRuntimeStatus(db, req.body?.runtime_status);
    const notReady = new Set(status.filter((s) => !s.ready).map((s) => s.runtime));
    const runtimes = (Array.isArray(req.body?.runtimes) ? req.body.runtimes : [])
      .map(String)
      .filter((r) => ["claude", "codex", "fake"].includes(r) && !notReady.has(r));
    await sweep();
    const job = await claim(db, cfg, runtimes);
    if (!job) return reply.code(204).send();
    return job;
  });
  app.post<{ Params: { id: string }; Body: { claim_token?: string; lines?: string[]; label?: string } }>("/runner/runs/:id/log", async (req) => {
    daemon(req);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines.map(String) : [];
    return runLog(db, cfg, req.params.id, req.body?.claim_token, lines, req.body?.label ? String(req.body.label) : undefined);
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
