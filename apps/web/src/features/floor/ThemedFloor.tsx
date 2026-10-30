import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { FloorData, FloorPage, FloorEntity, StationId } from "./types.js";
import type { ThemePackV1 } from "./themes/types.js";
import { loadTheme, getThemeEntry } from "./themes/registry.js";
import { PLAIN_THEME } from "./themes/plain.js";
import { useFloorData } from "./useFloorData.js";
import { useFloorPreferences } from "./useFloorPreferences.js";
import { useDocumentVisible, useFloorMotion } from "./useFloorMotion.js";
import { FloorScene } from "./FloorScene.js";
import { FloorList } from "./FloorList.js";
import { FloorToolbar } from "./FloorToolbar.js";
import { ThemeGallery } from "./ThemeGallery.js";
import { ThemeErrorBoundary } from "./ThemeErrorBoundary.js";
import "./floor.css";
async function preload(pack: ThemePackV1) {
  if (typeof Image.prototype.decode !== "function") return;
  await Promise.all(
    [pack.assets.scene, ...pack.assets.characters].filter(Boolean).map((a) => {
      const img = new Image();
      img.src = a!.path;
      return img.decode();
    }),
  );
}
export function FloorWorkbench({
  data,
  page,
  onPageChange,
  onOpen,
  visible = true,
  allowDrafts = false,
  sample = false,
}: {
  data: FloorData;
  page: FloorPage;
  onPageChange: (p: FloorPage) => void;
  onOpen: (e: FloorEntity) => void;
  visible?: boolean;
  allowDrafts?: boolean;
  sample?: boolean;
}) {
  const { preferences, update, externalDecision } = useFloorPreferences();
  const [pack, setPack] = useState<ThemePackV1>(PLAIN_THEME),
    [gallery, setGallery] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState("");
  const [selectedId, setSelectedId] = useState<string>(),
    [stationFilter, setStationFilter] = useState<StationId>(),
    [compact, setCompact] = useState(false),
    [intersecting, setIntersecting] = useState(true);
  const container = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    themeTrigger = useRef<HTMLDivElement>(null),
    generation = useRef(0),
    active = useRef(pack),
    mounted = useRef(true);
  active.current = pack;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const activate = useCallback(
    async (id: string, persist = true) => {
      const turn = ++generation.current;
      setLoading(id);
      setError("");
      try {
        const next = await loadTheme(id, allowDrafts);
        await preload(next);
        if (!mounted.current || turn !== generation.current) return;
        active.current = next;
        setPack(next);
        if (persist) update({ themeId: id });
        setGallery(false);
        themeTrigger.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
      } catch {
        if (turn === generation.current && mounted.current)
          setError(
            `Could not load ${getThemeEntry(id)?.title ?? "the saved theme"}. Try again or use Plain Floor.`,
          );
      } finally {
        if (turn === generation.current && mounted.current) setLoading("");
      }
    },
    [allowDrafts, update],
  );
  useEffect(() => {
    if (preferences.themeId !== active.current.id)
      void activate(preferences.themeId, false);
    else {
      generation.current++;
      setLoading("");
      setGallery(false);
    }
  }, [preferences.themeId, externalDecision, activate]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const resize = () => setCompact(el.getBoundingClientRect().width < 960);
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !container.current)
      return;
    const io = new IntersectionObserver(([entry]) =>
      setIntersecting(entry?.isIntersecting ?? false),
    );
    io.observe(container.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (selectedId && !data.model.entities.some((e) => e.id === selectedId)) {
      setSelectedId(undefined);
      setError("This activity is no longer in the current view.");
      heading.current?.focus();
    }
  }, [data.model.entities, selectedId]);
  const index = Math.max(
    0,
    Math.min(page.index, Math.ceil(data.model.matchingPackageCount / 30) - 1),
  );
  useEffect(() => {
    if (index !== page.index) onPageChange({ ...page, index });
  }, [index, page.index]);
  const effectiveView = compact ? "list" : preferences.view;
  const { mode, submittingIds } = useFloorMotion({
    entities: data.model.entities,
    requested: preferences.motion,
    health: data.health.state,
    sceneVisible:
      visible &&
      intersecting &&
      effectiveView === "scene" &&
      !gallery &&
      !loading,
    resetKey: `${pack.id}:${page.index}:${page.filter}`,
  });
  return (
    <section
      ref={container}
      className="floor-workbench"
      aria-labelledby="floor-world-title"
    >
      <div className="floor-page-heading">
        <div>
          <p className="floor-eyebrow">Your team, in its element</p>
          <h1 ref={heading} tabIndex={-1} id="floor-world-title">
            A world of work.
          </h1>
          <p>
            Activity for selected work packages. Every character has a real
            task.
          </p>
        </div>
        <a className="floor-office-link" href="/office">
          Your office <span aria-hidden="true">↗</span>
        </a>
      </div>
      {sample && (
        <p className="floor-sample-notice">
          Preview: sample activity. This is a demonstration, not live work.
        </p>
      )}
      {allowDrafts && (
        <p className="floor-draft-notice">
          Local draft artwork evaluation · Public release review pending
        </p>
      )}
      <div ref={themeTrigger}>
        <FloorToolbar
          title={pack.title}
          preferences={preferences}
          onUpdate={(p) => {
            setStationFilter(undefined);
            update(p);
          }}
          onThemes={() => setGallery(true)}
          page={page}
          onPageChange={onPageChange}
          total={data.model.matchingPackageCount}
          refresh={() => void data.refresh()}
        />
      </div>
      <div className="floor-status-strip" role="status" aria-live="polite">
        <span className={`floor-health-dot health-${data.health.state}`} />
        <span>
          {data.health.state === "healthy"
            ? `${data.loadedDetails} of ${data.requiredDetails} selected package details loaded`
            : data.health.state === "stale"
              ? "Updates unavailable, showing last known activity"
              : `Loading ${data.loadedDetails} of ${data.requiredDetails} selected package details`}
        </span>
        {data.health.oldestSuccessAt && (
          <time dateTime={new Date(data.health.oldestSuccessAt).toISOString()}>
            Updated{" "}
            {new Date(data.health.oldestSuccessAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        )}
        {loading && <span>Loading {getThemeEntry(loading)?.title}…</span>}
      </div>
      {data.health.failedKeys.length > 0 && (
        <p className="floor-notice">
          Could not load: {data.health.failedKeys.join(", ")}.{" "}
          <button
            className="floor-btn"
            type="button"
            onClick={() => void data.refresh()}
          >
            Retry
          </button>
        </p>
      )}
      {data.model.revisionConflicts.length > 0 && (
        <p className="floor-notice">
          Updating: {data.model.revisionConflicts.join(", ")}. Revision details
          do not match yet.
        </p>
      )}
      {error && (
        <p role="alert" className="floor-notice">
          {error}{" "}
          <button
            className="floor-btn"
            type="button"
            onClick={() => void activate("plain")}
          >
            Use Plain Floor
          </button>
        </p>
      )}
      {stationFilter && (
        <p className="floor-filter-note">
          Showing {pack.stations[stationFilter].label}{" "}
          <button
            className="floor-btn"
            type="button"
            onClick={() => setStationFilter(undefined)}
          >
            Show all activity
          </button>
        </p>
      )}
      <ThemeErrorBoundary
        key={`${pack.id}:${pack.version}`}
        onReset={() => {
          setPack(PLAIN_THEME);
          update({ themeId: "plain", view: "list" });
        }}
      >
        {effectiveView === "scene" ? (
          <FloorScene
            model={data.model}
            pack={pack}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={onOpen}
            onShowStation={(s) => {
              setStationFilter(s);
              update({ view: "list" });
            }}
            mode={mode}
            submittingIds={submittingIds}
          />
        ) : (
          <FloorList
            model={data.model}
            stationFilter={stationFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={onOpen}
          />
        )}
      </ThemeErrorBoundary>
      {data.health.state === "healthy" && data.model.entities.length === 0 && (
        <p className="floor-empty">
          {data.model.matchingPackageCount
            ? "No recorded activity in these work packages yet."
            : "No matching work packages."}
        </p>
      )}
      <div className="floor-footnote">
        <span>
          <span aria-hidden="true">◇</span> Agents pre-check. People decide.
        </span>
        <span>
          {pack.title} ·{" "}
          {compact
            ? "List view for smaller screens"
            : mode === "still"
              ? "Still · motion paused"
              : `${mode === "full" ? "Full" : "Quiet"} motion`}
        </span>
      </div>
      {data.model.warnings.length > 0 && (
        <details className="floor-source-notes">
          <summary>Source notes ({data.model.warnings.length})</summary>
          <ul>
            {data.model.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {gallery && (
        <ThemeGallery
          activeId={pack.id}
          onActivate={(id) => void activate(id)}
          onClose={() => setGallery(false)}
          allowDrafts={allowDrafts}
          error={error}
        />
      )}
    </section>
  );
}
export function ThemedFloor() {
  const [page, setPage] = useState<FloorPage>({
    index: 0,
    size: 30,
    filter: "active",
  });
  const visible = useDocumentVisible();
  const data = useFloorData(page, visible);
  const navigate = useNavigate();
  return (
    <FloorWorkbench
      data={data}
      page={page}
      onPageChange={setPage}
      visible={visible}
      allowDrafts={import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true"}
      onOpen={(e) => {
        void navigate({
          to: "/packages/$id",
          params: { id: e.packageId },
          ...(e.kind === "request" ? { hash: "decide" } : {}),
        });
      }}
    />
  );
}
