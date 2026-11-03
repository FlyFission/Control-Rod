import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server.js";

// jsdom has no scrolling; the router restores scroll positions on navigation.
window.scrollTo = (() => undefined) as typeof window.scrollTo;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
