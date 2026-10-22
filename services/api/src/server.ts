import { buildApp } from "./app.js";

const port = Number(process.env.CONTROLROD_PORT ?? 7300);
const app = buildApp();
await app.listen({ port, host: "127.0.0.1" });
