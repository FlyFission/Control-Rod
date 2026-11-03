import { setupServer } from "msw/node";

/** Mock control plane. Each test installs the handlers it needs. */
export const server = setupServer();
