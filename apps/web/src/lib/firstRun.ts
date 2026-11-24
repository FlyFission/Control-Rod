import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, ApiError } from "../api/client.js";
import { readSession } from "./storage.js";

/** Set for this browser session when the person chooses "Skip for now" on the setup page. */
export const SETUP_SKIPPED_KEY = "cr.setupSkipped";

/**
 * Opens setup until the person has confirmed it once (docs/patterns/onboarding.md step 3). "Skip for
 * now" holds for this browser session only, so the next visit asks again until setup is done.
 */
export function useFirstRunSetup(path: string) {
  const navigate = useNavigate();
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setup });
  const shouldCheck =
    setup.data?.confirmed === false && path !== "/setup" && readSession(SETUP_SKIPPED_KEY) !== "1";
  const admin = useQuery({
    queryKey: ["admin"],
    queryFn: api.admin,
    enabled: shouldCheck,
  });
  const canRecordSetup =
    admin.data !== undefined
      ? Boolean(admin.data.bootstrap) ||
        admin.data.actions.some((a) => a.command === "setup.record" && a.allowed)
      : !(admin.error instanceof ApiError && admin.error.status === 403);
  useEffect(() => {
    if (shouldCheck && !admin.isLoading && canRecordSetup) void navigate({ to: "/setup" });
  }, [shouldCheck, admin.isLoading, canRecordSetup, navigate]);
}
