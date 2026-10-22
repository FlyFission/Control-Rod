import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client.js";
import { Shell } from "./components/Shell.js";
import { useLiveEvents } from "./lib/live.js";
import { Board } from "./pages/Board.js";
import { Floor } from "./pages/Floor.js";
import { Home } from "./pages/Home.js";
import { Office } from "./pages/Office.js";
import { PackagePage } from "./pages/PackagePage.js";
import { Records } from "./pages/Records.js";
import { SignIn } from "./pages/SignIn.js";

function Root() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const signedIn = session.data?.signed_in === true;
  useLiveEvents(signedIn);
  if (session.isLoading) return <p className="muted center">Loading</p>;
  if (session.isError || session.data === undefined) {
    return (
      <main className="signin">
        <p role="alert" className="error">
          The control plane is not reachable. Start it with pnpm cr start, then reload.
        </p>
      </main>
    );
  }
  if (!signedIn) return <SignIn session={session.data} />;
  return (
    <Shell session={session.data}>
      <Outlet />
    </Shell>
  );
}

const rootRoute = createRootRoute({ component: Root });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home }),
  createRoute({ getParentRoute: () => rootRoute, path: "/office", component: Office }),
  createRoute({ getParentRoute: () => rootRoute, path: "/board", component: Board }),
  createRoute({ getParentRoute: () => rootRoute, path: "/floor", component: Floor }),
  createRoute({ getParentRoute: () => rootRoute, path: "/records", component: Records }),
];

const packageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packages/$id",
  component: function PackageRoute() {
    const { id } = packageRoute.useParams();
    return <PackagePage id={id} />;
  },
});

const routeTree = rootRoute.addChildren([...routes, packageRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
