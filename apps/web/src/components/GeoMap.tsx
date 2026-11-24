import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Draws GeoJSON as offline vector geometry by default, with opt-in OpenStreetMap tiles. */
export default function GeoMap({ data }: { data: unknown }) {
  const el = useRef<HTMLDivElement>(null);
  const [tilesEnabled, setTilesEnabled] = useState(false);

  useEffect(() => {
    if (el.current === null) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    if (tilesEnabled) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
    }
    // Leaflet writes colours into SVG attributes, so read the design tokens as values.
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      style: { color: token("--accent"), weight: 2, fillOpacity: 0.12 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 6, color: token("--needs") }),
    }).addTo(map);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    else map.setView([20, 0], 2);
    return () => {
      map.remove();
    };
  }, [data, tilesEnabled]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
        <span className="small muted">
          {tilesEnabled ? "OpenStreetMap base tiles enabled." : "Vector preview (no external map tile requests)."}
        </span>
        {!tilesEnabled && (
          <button type="button" className="btn small" onClick={() => setTilesEnabled(true)}>
            Load map tiles (OpenStreetMap)
          </button>
        )}
      </div>
      <div ref={el} className="geomap" role="img" aria-label="Map of the GeoJSON output" />
    </div>
  );
}
