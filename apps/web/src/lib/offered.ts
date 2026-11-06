import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { ActionDescriptor, WorkPackage } from "../api/types.js";
import { blockUnverifiedAccept, isVerified, needsIndependentCheck } from "./board.js";

export type OfferedActions = {
  /** The server's actions with the acceptance block applied; undefined until they are read. */
  data: ActionDescriptor[] | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  refetch(): void;
  /** Person verifications could not be read, so Accept stays blocked. */
  verificationsFailed: boolean;
  refetchVerifications(): void;
};

/**
 * What the viewer may do on a package, for the package page and the case view. It is the server's
 * action list with the one acceptance rule applied (ruling 16, blockUnverifiedAccept): on Safety or
 * Material work, Accept is offered only when a passing person verification covers the current work.
 * Until the verifications are read, or when they cannot be, Accept is not offered.
 */
export function useOfferedActions(pkg: WorkPackage): OfferedActions {
  const actions = useQuery({ queryKey: ["actions", pkg.id], queryFn: () => api.packageActions(pkg.id) });
  const independent = needsIndependentCheck(pkg);
  const verifs = useQuery({ queryKey: ["person-verifications", pkg.id], queryFn: () => api.personVerifications(pkg.id), enabled: independent });
  const verified = verifs.data ? isVerified(pkg, verifs.data) : false;
  return {
    data: actions.data === undefined ? undefined : blockUnverifiedAccept(pkg, actions.data, verified),
    isLoading: actions.isLoading,
    isSuccess: actions.isSuccess,
    isError: actions.isError,
    refetch: () => void actions.refetch(),
    verificationsFailed: independent && verifs.isError,
    refetchVerifications: () => void verifs.refetch(),
  };
}
