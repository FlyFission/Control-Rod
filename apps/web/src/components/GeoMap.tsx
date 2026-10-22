import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Draws GeoJSON over OpenStreetMap tiles. Loaded only when a GeoJSON output is opened. */
export default function GeoMap({ data }: { data: unknown }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current === null) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      style: { color: "#5CC8FF", weight: 2, fillOpacity: 0.12 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 6, color: "#F2B33D" }),
    }).addTo(map);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    else map.setView([34.0, -81.0], 7);
    return () => {
      map.remove();
    };
  }, [data]);
  return <div ref={el} className="geomap" role="img" aria-label="Map of the GeoJSON output" />;
}
