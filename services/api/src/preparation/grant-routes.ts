import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "../db/index.js";
import {
  beginGrantUse,
  finishGrantUse,
  revokePreparationGrant,
} from "./grants.js";
import { checkGrantCredential, type GrantConfig } from "./grant-state.js";
import type {
  PreparationGrantIntent,
  PreparationUseFinalize,
} from "./types.js";
export function grantRoutes(
  app: FastifyInstance,
  db: Db,
  cfg: GrantConfig,
  person: (req: FastifyRequest) => Promise<string>,
) {
  const token = (req: FastifyRequest) =>
    /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "")?.[1];
  const preauth = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    await checkGrantCredential(
      db,
      (req.params as { id: string }).id,
      token(req),
    );
  };
  const policy = { bodyLimit: 8 * 1024 * 1024, onRequest: preauth };
  app.post<{ Params: { id: string }; Body: PreparationGrantIntent }>(
    "/runner/preparation-grants/:id/begin",
    { ...policy, schema: { body: { $ref: "PreparationGrantIntent.json" } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return beginGrantUse(db, cfg, req.params.id, token(req), req.body);
    },
  );
  app.post<{ Params: { id: string }; Body: PreparationUseFinalize }>(
    "/runner/preparation-grants/:id/finalize",
    { ...policy, schema: { body: { $ref: "PreparationUseFinalize.json" } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return finishGrantUse(db, cfg, req.params.id, token(req), req.body);
    },
  );
  app.post<{ Params: { packageId: string; id: string } }>(
    "/packages/:packageId/preparation-grants/:id/revoke",
    async (req, reply) => {
      const user = await person(req);
      reply.header("Cache-Control", "no-store");
      return revokePreparationGrant(
        db,
        req.params.id,
        req.params.packageId,
        user,
      );
    },
  );
}
