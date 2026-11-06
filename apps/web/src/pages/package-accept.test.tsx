import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { view } from "../test/fixtures.js";
import { server } from "../test/server.js";
import { PackagePage } from "./PackagePage.js";

/** Ruling 16 on the package page: arriving straight at /packages/:id#decide offers no unverified Accept. */
describe("package page acceptance", () => {
  it("offers no Accept on unverified Safety work when navigated to directly", async () => {
    // jsdom has no layout; the page scrolls to #decide on arrival.
    Element.prototype.scrollIntoView = () => {};
    server.use(
      http.get("*/packages/WP-0001", () => HttpResponse.json(view({}, { status: "in-verification", grade: "safety" }))),
      http.get("*/packages/WP-0001/actions", () =>
        HttpResponse.json([
          { command: "accept", label: "Accept", allowed: true, signature: "direct" },
          { command: "reject", label: "Reject", allowed: true, signature: "direct" },
        ]),
      ),
      http.get("*/packages/WP-0001/person-verifications", () => HttpResponse.json([])),
      http.get("*/packages/WP-0001/preparation", () => HttpResponse.json({}, { status: 404 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRootRoute();
    const page = createRoute({ getParentRoute: () => root, path: "/packages/$id", component: () => <PackagePage id="WP-0001" /> });
    const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/packages/WP-0001#decide"] }) });
    await router.load();
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Reject" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/A person verification of the current work must come before/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });
});
