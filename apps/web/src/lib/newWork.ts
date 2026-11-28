import { createContext, useContext } from "react";

/**
 * Opens the shell's New Work dialog, the same one the rail's "+ New change" button and the C key
 * open. The shell provides it; outside the shell (a page rendered alone in a test) there is none.
 * Pages call this rather than reaching for the rail's button in the page (WEB-2).
 */
export const NewWorkContext = createContext<(() => void) | undefined>(undefined);

export function useOpenNewWork(): (() => void) | undefined {
  return useContext(NewWorkContext);
}
