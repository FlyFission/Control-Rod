import {
  Outlet,
  createRootRoute,
  redirect,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api/client.js";
import { Shell } from "./components/Shell.js";
import { useLiveEvents } from "./lib/live.js";
import { sessionIdentity, watchSessionIdentity } from "./lib/session.js";
import { CasePage } from "./features/case/CasePage.js";
import { Explore } from "./pages/Explore.js";
import { Inbox } from "./pages/Inbox.js";
import { OfficePlace } from "./pages/OfficePlace.js";
import { PackagePage } from "./pages/PackagePage.js";
import { Packages } from "./pages/Packages.js";
import { Policies } from "./pages/Policies.js";
import { Records } from "./pages/Records.js";
import { Registers } from "./pages/Registers.js";
import { Roster } from "./pages/Roster.js";
import { SignIn } from "./pages/SignIn.js";
import { Usage } from "./pages/Usage.js";

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

/** The places (specification 12). "/" opens the Inbox; the floor and board are the Office's two views. */
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", beforeLoad: () => { throw redirect({ to: "/inbox" }); } }),
  createRoute({ getParentRoute: () => rootRoute, path: "/inbox", component: Inbox }),
  createRoute({ getParentRoute: () => rootRoute, path: "/office", component: () => <OfficePlace view="office" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: "/floor", component: () => <OfficePlace view="floor" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: "/board", component: () => <OfficePlace view="board" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: "/packages", component: Packages }),
  createRoute({ getParentRoute: () => rootRoute, path: "/registers", component: Registers }),
  createRoute({ getParentRoute: () => rootRoute, path: "/explore", component: Explore }),
  createRoute({ getParentRoute: () => rootRoute, path: "/roster", component: Roster }),
  createRoute({ getParentRoute: () => rootRoute, path: "/usage", component: Usage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/records", component: Records }),
  createRoute({ getParentRoute: () => rootRoute, path: "/policies", component: Policies }),
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

export const router = createRouter({ routeTree, defaultErrorComponent: PlaceError });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
