import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../api/client.js";
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
  const unconfirmed = setup.data?.confirmed === false;
  useEffect(() => {
    if (unconfirmed && path !== "/setup" && readSession(SETUP_SKIPPED_KEY) !== "1") void navigate({ to: "/setup" });
  }, [unconfirmed, path, navigate]);
}
