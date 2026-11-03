import { Link } from "@tanstack/react-router";
import { OfficeView } from "../features/office/OfficeView.js";
import { Board } from "./Board.js";
import { Floor } from "./Floor.js";

/**
 * The Office place: the office view (the floor of cube sets and rooms), and the board. The station
 * floor stays reachable at /floor until its worlds move to the office's rooms (plan task 4.9).
 */
export function OfficePlace({ view }: { view: "office" | "floor" | "board" }) {
  return (
    <div className="place">
      <nav aria-label="Office views" className="view-switch">
        <Link to="/office" className={view === "office" ? "view active" : "view"} aria-current={view === "office" ? "page" : undefined}>
          Floor
        </Link>
        <Link to="/board" className={view === "board" ? "view active" : "view"} aria-current={view === "board" ? "page" : undefined}>
          Board
        </Link>
      </nav>
      {view === "office" ? <OfficeView /> : view === "floor" ? <Floor /> : <Board />}
    </div>
  );
}
