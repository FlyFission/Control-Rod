import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db } from "../db/index.js";
import { Refusal, type WorkConfig } from "../work.js";
import {
  enrollPreparation,
  editPreparation,
  readPreparation,
  preparationHistory,
  resolvePreparation,
} from "./store.js";
import type {
  PreparationContent,
  PreparationView,
  ResolutionRequest,
} from "./types.js";

export function preparationRoutes(
  app: FastifyInstance,
  db: Db,
  cfg: WorkConfig,
  person: (req: FastifyRequest) => Promise<string>,
) {
  type Params = { id: string };
  const send = (reply: import("fastify").FastifyReply, v: PreparationView) =>
    reply
      .header("ETag", `"${v.content_digest.value}"`)
      .header("Cache-Control", "no-store")
      .send(v);
  app.post<{
    Params: Params;
    Body: { package_revision: number; idempotency_key: string };
  }>("/packages/:id/preparation", async (req, reply) => {
    const user = await person(req);
    if (!cfg.guidedPreparation)
      throw new Refusal(
        403,
        "preparation-disabled",
        "The owner has not enabled manual preparation enrollment",
      );
    return send(
      reply,
      await enrollPreparation(db, cfg, user, req.params.id, req.body),
    );
  });
  app.get<{ Params: Params }>(
    "/packages/:id/preparation",
    async (req, reply) => {
      await person(req);
      return send(reply, await readPreparation(db, req.params.id));
    },
  );
  app.put<{ Params: Params; Body: PreparationContent }>(
    "/packages/:id/preparation",
    async (req, reply) =>
      send(
        reply,
        await editPreparation(
          db,
          cfg,
          await person(req),
          req.params.id,
          req.body,
          req.headers["if-match"],
        ),
      ),
  );
  app.post<{ Params: Params; Body: ResolutionRequest }>(
    "/packages/:id/preparation/resolutions",
    async (req, reply) =>
      send(
        reply,
        await resolvePreparation(
          db,
          cfg,
          await person(req),
          req.params.id,
          req.body,
          req.headers["if-match"],
        ),
      ),
  );
  app.get<{ Params: Params; Querystring: { before?: string; limit?: string } }>(
    "/packages/:id/preparation/history",
    async (req, reply) => {
      await person(req);
      reply.header("Cache-Control", "no-store");
      return preparationHistory(
        db,
        req.params.id,
        req.query.before === undefined ? undefined : Number(req.query.before),
        req.query.limit === undefined ? 20 : Number(req.query.limit),
      );
    },
  );
}
