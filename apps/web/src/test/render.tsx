import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

/** Renders a component inside a fresh query client and a one-page router. */
export async function renderPage(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "/", component: () => <>{node}</> });
  const pkg = createRoute({ getParentRoute: () => root, path: "/packages/$id", component: () => <p>package</p> });
  const router = createRouter({
    routeTree: root.addChildren([page, pkg]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const utils = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, qc, router };
}
