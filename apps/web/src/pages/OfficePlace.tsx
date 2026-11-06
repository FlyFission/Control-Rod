import { OfficeView } from "../features/office/OfficeView.js";
import { Floor } from "./Floor.js";

/**
 * The Office place: the office view (the floor of cube sets and rooms). The board is the home page at "/".
 * The station floor stays reachable at /floor: its fifteen worlds are now office themes (plan task 4.9), and
 * retiring it with its pack pipeline is a separate change.
 */
export function OfficePlace({ view }: { view: "office" | "floor" }) {
  return (
    <div className="place">
      {view === "office" ? <OfficeView /> : <Floor />}
    </div>
  );
}
