import Fastify, { type FastifyInstance } from "fastify";
import { loadValidator } from "./schemas.js";

export const VERSION = "0.0.0";

interface WorkPackageLike {
  id: string;
  [key: string]: unknown;
}

/**
 * Builds the control plane app. Phase 0 skeleton: health and an in-memory package store,
 * validating every request against the TypeSpec-generated schemas. No decision logic lives
 * here; state changes will be decided by the Rust kernel.
 */
export function buildApp(): FastifyInstance {
  const ajv = loadValidator();
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  const packages = new Map<string, WorkPackageLike>();

  app.get("/health", async () => ({ status: "ok" as const, version: VERSION }));

  app.get("/packages", async () => [...packages.values()]);

  app.post<{ Body: WorkPackageLike }>(
    "/packages",
    { schema: { body: { $ref: "WorkPackage.json" } } },
    async (request, reply) => {
      packages.set(request.body.id, request.body);
      return reply.code(201).send(request.body);
    },
  );

  app.get<{ Params: { id: string } }>("/packages/:id", async (request, reply) => {
    const pkg = packages.get(request.params.id);
    if (pkg === undefined) {
      return reply.code(404).send({ code: "not_found", message: "No such package" });
    }
    return pkg;
  });

  return app;
}
