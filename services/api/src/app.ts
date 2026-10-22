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
  packageOutput,
  packageView,
  runLog,
  runLogLines,
  updateDraft,
} from "./work.js";

export const VERSION = "0.1.0";

export interface AppOptions {
  db: Db;
  auth: AuthConfig;
  root: string;
  /** Built web app to serve at /, if present. */
  webDir?: string;
}

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
  const cfg: WorkConfig = { root: opts.root, ajv };
  const { db, auth } = opts;
  const app = Fastify({ logger: false, bodyLimit: 150 * 1024 * 1024 });
  app.register(cookie);
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) return reply.code(err.status).send({ code: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ code: "invalid", message: (err as Error).message });
    return reply.code(500).send({ code: "error", message: "Something went wrong; it is in the server log." });
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
    return packageView(db, req.params.id);
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
    return reply.header("content-type", MIME[ext] ?? "application/octet-stream").header("x-content-type-options", "nosniff").send(bytes);
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
  }
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/packages/:id/decisions/options", async (req) => {
    await person(req);
    const { kind, package_revision: revision } = req.body ?? ({} as DecisionBody);
    const s = await decisionSubject(db, req.params.id, String(kind), Number(revision));
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

  app.get("/office", async (req) => {
    await person(req);
    return office(db);
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
  app.post<{ Body: { runtimes?: string[] } }>("/runner/claim", async (req, reply) => {
    daemon(req);
    const runtimes = (req.body?.runtimes ?? []).filter((r) => ["claude", "codex", "fake"].includes(r));
    const job = await claim(db, cfg, runtimes);
    if (!job) return reply.code(204).send();
    return job;
  });
  app.post<{ Params: { id: string }; Body: { lines?: string[]; label?: string } }>("/runner/runs/:id/log", async (req, reply) => {
    daemon(req);
    await runLog(db, req.params.id, (req.body?.lines ?? []).map(String), req.body?.label ? String(req.body.label) : undefined);
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>("/runner/runs/:id/complete", async (req, reply) => {
    daemon(req);
    await complete(db, cfg, req.params.id, req.body);
    return reply.code(204).send();
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    app.register(fastifyStatic, { root: opts.webDir, prefix: "/", wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && req.headers.accept?.includes("text/html")) return reply.sendFile("index.html");
      return reply.code(404).send({ code: "not-found", message: "Not found" });
    });
  }

  return app;
}
