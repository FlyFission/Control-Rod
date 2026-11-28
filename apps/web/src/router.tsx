import {
  Outlet,
  createRootRoute,
  redirect,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setUnauthorizedHandler } from "./api/client.js";
import { Shell } from "./components/Shell.js";
import { useLiveEvents } from "./lib/live.js";
import { sessionIdentity, watchSessionIdentity } from "./lib/session.js";
import { Board } from "./pages/Board.js";
import { Inbox } from "./pages/Inbox.js";
import { SignIn } from "./pages/SignIn.js";

/**
 * Places past the Board and the Inbox load when first opened, so the first screen does not wait for
 * the Plant's scenes, the file viewers or the admin pages (each becomes its own chunk in the build).
 */
const ControlRoom = lazyRouteComponent(() => import("./pages/ControlRoom.js"), "ControlRoom");
const Compare = lazyRouteComponent(() => import("./pages/Compare.js"), "Compare");
const Explore = lazyRouteComponent(() => import("./pages/Explore.js"), "Explore");
const PackagePage = lazyRouteComponent(() => import("./pages/PackagePage.js"), "PackagePage");
const Packages = lazyRouteComponent(() => import("./pages/Packages.js"), "Packages");
const Policies = lazyRouteComponent(() => import("./pages/Policies.js"), "Policies");
const Records = lazyRouteComponent(() => import("./pages/Records.js"), "Records");
const Registers = lazyRouteComponent(() => import("./pages/Registers.js"), "Registers");
const AgentsRoster = lazyRouteComponent(() => import("./pages/AgentsRoster.js"), "AgentsRoster");
const Today = lazyRouteComponent(() => import("./pages/Today.js"), "Today");
const Usage = lazyRouteComponent(() => import("./pages/Usage.js"), "Usage");
const Setup = lazyRouteComponent(() => import("./pages/Setup.js"), "Setup");
const Workflow = lazyRouteComponent(() => import("./pages/Workflow.js"), "Workflow");
const CasePage = lazyRouteComponent(() => import("./features/case/CasePage.js"), "CasePage");
const PlantPlace = lazyRouteComponent(() => import("./pages/OfficePlace.js").then((m) => ({ PlantPlace: () => <m.OfficePlace view="office" /> })), "PlantPlace");
const FloorPlace = lazyRouteComponent(() => import("./pages/OfficePlace.js").then((m) => ({ FloorPlace: () => <m.OfficePlace view="floor" /> })), "FloorPlace");

/**
 * Decides between the sign-in page and the app from the session query. Exported so tests can drive
 * the real gate without the whole route tree.
 *
 * Any change of the signed-in identity, however it arrives (this tab signing in or out, or a refetch
 * that finds another tab signed someone else in), runs one transition (lib/session.ts), and the
 * subtree is keyed by identity, so a change remounts it and drops component state such as editor
 * drafts and the ETags they carry.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  useEffect(() => watchSessionIdentity(qc), [qc]);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void qc.invalidateQueries({ queryKey: ["session"] });
    });
    return () => setUnauthorizedHandler(undefined);
  }, [qc]);
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const signedIn = session.data?.signed_in === true;
  useLiveEvents(signedIn);
  if (session.isLoading && session.data === undefined) return <p className="muted center">Loading</p>;
  if (session.data === undefined) {
    return (
      <main className="signin">
        <p role="alert" className="error">
          The control plane is not reachable. Start it with pnpm cr start, then reload.
        </p>
        <button type="button" className="btn" onClick={() => void session.refetch()}>
          Retry
        </button>
      </main>
    );
  }
  const identity = sessionIdentity(session.data);
  if (!signedIn) return <SignIn key={identity} session={session.data} />;
  return (
    <Shell key={identity} session={session.data}>
      {children}
    </Shell>
  );
}

function Root() {
  return (
    <SessionGate>
      <Outlet />
    </SessionGate>
  );
}

const rootRoute = createRootRoute({ component: Root });

/** The places (specification 12). "/" is the board; "/board" is its old address. The Inbox stays at /inbox. "/office" is the Plant's old address. */
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Board }),
  createRoute({ getParentRoute: () => rootRoute, path: "/inbox", component: Inbox }),
  createRoute({ getParentRoute: () => rootRoute, path: "/plant", component: PlantPlace }),
  // The office became the Plant; its old address (the shell's SCRAM banner and the floor link to it) still arrives.
  createRoute({ getParentRoute: () => rootRoute, path: "/office", beforeLoad: () => { throw redirect({ to: "/plant" }); } }),
  createRoute({ getParentRoute: () => rootRoute, path: "/floor", component: FloorPlace }),
  createRoute({ getParentRoute: () => rootRoute, path: "/board", beforeLoad: () => { throw redirect({ to: "/" }); } }),
  createRoute({ getParentRoute: () => rootRoute, path: "/packages", component: Packages }),
  createRoute({ getParentRoute: () => rootRoute, path: "/registers", component: Registers }),
  createRoute({ getParentRoute: () => rootRoute, path: "/snapshots", component: Explore }),
  createRoute({ getParentRoute: () => rootRoute, path: "/explore", beforeLoad: () => { throw redirect({ to: "/snapshots" }); } }),
  createRoute({ getParentRoute: () => rootRoute, path: "/compare", component: Compare }),
  createRoute({ getParentRoute: () => rootRoute, path: "/today", component: Today }),
  createRoute({ getParentRoute: () => rootRoute, path: "/setup", component: Setup }),
  createRoute({ getParentRoute: () => rootRoute, path: "/workflow", component: Workflow }),
  createRoute({ getParentRoute: () => rootRoute, path: "/agents", component: AgentsRoster }),
  // The Roster and Provider CLIs became one Agents roster; their details sit under its Advanced section.
  createRoute({ getParentRoute: () => rootRoute, path: "/roster", beforeLoad: () => { throw redirect({ to: "/agents" }); } }),
  createRoute({ getParentRoute: () => rootRoute, path: "/usage", component: Usage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/control-room", component: ControlRoom }),
  createRoute({ getParentRoute: () => rootRoute, path: "/records", component: Records }),
  createRoute({ getParentRoute: () => rootRoute, path: "/policies", component: Policies }),
  createRoute({ getParentRoute: () => rootRoute, path: "/settings/subscriptions", beforeLoad: () => { throw redirect({ to: "/agents" }); } }),
];

const packageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packages/$id",
  component: function PackageRoute() {
    const { id } = packageRoute.useParams();
    return <PackagePage id={id} />;
  },
});

/** The case view, a preview beside the package page (plan task 3.4). */
const caseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packages/$id/case",
  component: function CaseRoute() {
    const { id } = caseRoute.useParams();
    return <CasePage id={id} />;
  },
});

const routeTree = rootRoute.addChildren([...routes, packageRoute, caseRoute]);

/** A place that fails to render says so inside the shell; navigation and the palette keep working. */
export function PlaceError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <section className="panel" role="alert" aria-labelledby="place-error-title">
      <h1 id="place-error-title">This place could not be shown</h1>
      <p className="muted">{error instanceof Error ? error.message : "Something unexpected happened."}</p>
      <p className="muted small">Other places still work. Try again, or open another place from the navigation.</p>
      <button type="button" className="btn small" onClick={reset}>
        Try again
      </button>
    </section>
  );
}

function PlaceNotFound() {
  return (
    <div className="place">
      <h1>Page not found</h1>
      <p className="muted">That route does not exist in Control Rod.</p>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  defaultErrorComponent: PlaceError,
  defaultNotFoundComponent: PlaceNotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
