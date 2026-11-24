import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server.js";
import { resetSingleKeysForTest } from "../lib/singleKeys.js";

// jsdom has no scrolling; the router restores scroll positions on navigation.
window.scrollTo = (() => undefined) as typeof window.scrollTo;

// jsdom has no layout, so the shell's resizable rail runs on a stand-in (see the file for why).
vi.mock("react-resizable-panels", () => import("./resizablePanelsMock.js"));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  resetSingleKeysForTest();
});
afterAll(() => server.close());
