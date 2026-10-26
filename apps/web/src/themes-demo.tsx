import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { FloorWorkbench } from "./features/floor/ThemedFloor.js";
import { showcaseInput } from "./features/floor/showcase-data.js";
import { projectFloor } from "./features/floor/project.js";
import type { FloorPage, FloorEntity } from "./features/floor/types.js";
import "./styles.css";
function Showcase() {
  const [page, setPage] = useState<FloorPage>({
      index: 0,
      size: 30,
      filter: "all",
    }),
    [opened, setOpened] = useState<FloorEntity>();
  const input = useMemo(showcaseInput, []);
  const model = useMemo(() => projectFloor({ ...input, page }), [input, page]);
  return (
    <main
      className="content"
      style={{
        maxWidth: 1500,
        margin: "0 auto",
        padding: "32px clamp(16px,4vw,60px)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 3,
          color: "#bed5d4",
          marginBottom: 32,
        }}
      >
        CONTROL ROD{" "}
        <span style={{ color: "#a7b6c4", letterSpacing: 1, marginLeft: 16 }}>
          WORKING WORLDS / DESIGN PREVIEW
        </span>
      </div>
      <FloorWorkbench
        data={{
          model,
          health: {
            state: "healthy",
            failedKeys: [],
            oldestSuccessAt: Date.now(),
          },
          loadedDetails: model.selectedPackages.length,
          requiredDetails: model.selectedPackages.length,
          refresh: async () => {},
        }}
        page={page}
        onPageChange={setPage}
        onOpen={setOpened}
        allowDrafts={
          import.meta.env.DEV ||
          import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true"
        }
        sample
      />
      {opened && (
        <aside role="status" className="floor-notice">
          Sample detail: {opened.packageId} · {opened.label}. This preview does
          not open or change live work.{" "}
          <button
            type="button"
            className="floor-btn"
            onClick={() => setOpened(undefined)}
          >
            Dismiss
          </button>
        </aside>
      )}
    </main>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<Showcase />);
