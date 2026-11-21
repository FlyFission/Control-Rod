import { Link } from "@tanstack/react-router";
import { ApiError, explain } from "../api/client.js";

/**
 * Why a package page could not show its package. A package that does not exist is said so, with a way
 * on; anything else names the failure and offers a retry. Found by the live break pass: a mistyped link
 * read "Could not load package", which sounds like an outage.
 */
export function PackageLoadError({ id, error, retry }: { id: string; error: unknown; retry: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div role="alert" className="panel">
        <p>There is no package {id}. The link may be mistyped, or the package was never created.</p>
        <p>
          <Link to="/packages">See all packages</Link>
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="error">
      <p>
        Could not load package {id}. {explain(error, "")}
      </p>
      <button type="button" className="btn small" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
