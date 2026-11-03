import type { FastifyInstance, FastifyRequest } from "fastify";
import { assertionOptions, assertionVerify, type AuthConfig } from "../auth.js";
import {
  confirmationSubject,
  confirmationChallenge,
  confirmRequirements,
} from "./subjects.js";
import type { Db } from "../db/index.js";
import { Refusal, type WorkConfig } from "../work.js";
import {
  enrollPreparation,
  editPreparation,
  readPreparation,
  preparationHistory,
  resolvePreparation,
  refreshPreparationBasis,
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
  auth: AuthConfig,
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
  app.post<{
    Params: Params;
    Body: {
      expected_requirements_digest: { algorithm: string; value: string };
    };
  }>(
    "/packages/:id/preparation/confirm/options",
    { schema: { body: { $ref: "ConfirmationOptionsRequest.json" } } },
    async (req, reply) => {
      const issuedTo = await person(req);
      const subject = await confirmationSubject(
        db,
        req.params.id,
        req.body.expected_requirements_digest,
        issuedTo,
      );
      const options = await assertionOptions(
        db,
        auth,
        "preparation-confirmation",
        subject,
        confirmationChallenge(subject),
        issuedTo,
      );
      return reply.header("Cache-Control", "no-store").send({
        requirements_digest: {
          algorithm: "sha256",
          value: subject.requirements_digest,
        },
        options,
      });
    },
  );
  app.post<{ Params: Params; Body: { assertion: Record<string, unknown> } }>(
    "/packages/:id/preparation/confirm",
    { schema: { body: { $ref: "ConfirmationRequest.json" } } },
    async (req, reply) => {
      const user = await person(req);
      const ok = await assertionVerify(
        db,
        auth,
        "preparation-confirmation",
        req.body.assertion as never,
      );
      if (!ok || ok.user !== user)
        throw new Refusal(
          403,
          "unsigned",
          "A current requirements confirmation passkey assertion is required",
        );
      if (
        typeof ok.data.package_id !== "string" ||
        typeof ok.data.package_revision !== "number" ||
        typeof ok.data.requirements_digest !== "string"
      )
        throw new Refusal(403, "unsigned", "Invalid confirmation subject");
      const confirmation = await confirmRequirements(
        db,
        cfg,
        user,
        req.params.id,
        {
          user: ok.user,
          package_id: ok.data.package_id,
          package_revision: ok.data.package_revision,
          requirements_digest: ok.data.requirements_digest,
          assertion: req.body.assertion,
        },
      );
      return reply.code(201).send(confirmation);
    },
  );
  app.post<{ Params: Params }>(
    "/packages/:id/preparation/basis/refresh",
    async (req, reply) =>
      send(
        reply,
        await refreshPreparationBasis(
          db,
          cfg,
          await person(req),
          req.params.id,
          req.headers["if-match"],
        ),
      ),
  );
  app.get<{ Params: Params }>(
    "/packages/:id/preparation",
    async (req, reply) => {
      await person(req);
      return send(reply, await readPreparation(db, req.params.id, cfg));
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
