import { Link } from "@tanstack/react-router";
import { Board } from "./Board.js";
import { Floor } from "./Floor.js";

/** Office (specification 12 and 13): the floor and the board, one place with two views. */
export function OfficePlace({ view }: { view: "floor" | "board" }) {
  return (
    <div className="place">
      <nav aria-label="Office views" className="view-switch">
        <Link to="/office" className={view === "floor" ? "view active" : "view"} aria-current={view === "floor" ? "page" : undefined}>
          Floor
        </Link>
        <Link to="/board" className={view === "board" ? "view active" : "view"} aria-current={view === "board" ? "page" : undefined}>
          Board
        </Link>
      </nav>
      {view === "floor" ? <Floor /> : <Board />}
    </div>
  );
}
