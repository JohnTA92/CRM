import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/primitives/Button";
import {
  Navigation, ChevronLeft, ChevronRight, GripVertical,
  MapPin, Loader2, AlertCircle, ExternalLink, Briefcase, Clock,
} from "lucide-react";

const STOP_COLORS = ["#1d4ed8","#16a34a","#dc2626","#9333ea","#ea580c","#0891b2","#be185d","#ca8a04"];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

type Stop = {
  id: string;
  title: string;
  customerName: string;
  address: string;
  scheduledTime: string | null;
  lat: number | null;
  lng: number | null;
  geocoding: "pending" | "done" | "failed";
};

async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  // Try full address first, then fall back to just city/state/zip
  const result = await nominatim(address);
  if (result) return result;
  // Fallback: drop street, keep city state zip
  const parts = address.split(",").map(s => s.trim());
  if (parts.length >= 3) {
    const fallback = parts.slice(1).join(", ");
    return nominatim(fallback);
  }
  return null;
}

// Renders an inline SVG map using geocoded lat/lng points
const TILE_SIZE = 256;

function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}
function lngToTileX(lng: number, z: number) {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

function pickZoom(latSpan: number, lngSpan: number) {
  const span = Math.max(latSpan, lngSpan);
  if (span > 5) return 8;
  if (span > 2) return 9;
  if (span > 1) return 10;
  if (span > 0.4) return 11;
  if (span > 0.15) return 12;
  if (span > 0.05) return 13;
  return 14;
}

function InlineMap({ stops }: { stops: Stop[] }) {
  const pts = stops.filter((s) => s.lat && s.lng);

  if (pts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <MapPin className="w-8 h-8 text-ink-quiet opacity-20 mb-2" />
        <p className="text-[13px] text-ink-quiet">
          {stops.some((s) => s.geocoding === "pending") ? "Geocoding addresses…" : "No addresses could be located"}
        </p>
      </div>
    );
  }

  const lats = pts.map((s) => s.lat!);
  const lngs = pts.map((s) => s.lng!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const zoom = pickZoom(maxLat - minLat, maxLng - minLng);

  // Tile range with 1-tile padding
  const txMin = Math.floor(lngToTileX(minLng, zoom)) - 1;
  const txMax = Math.floor(lngToTileX(maxLng, zoom)) + 1;
  const tyMin = Math.floor(latToTileY(maxLat, zoom)) - 1;
  const tyMax = Math.floor(latToTileY(minLat, zoom)) + 1;

  // Cap tile count to avoid loading hundreds of tiles
  const clampedTxMax = Math.min(txMax, txMin + 5);
  const clampedTyMax = Math.min(tyMax, tyMin + 5);

  const W = (clampedTxMax - txMin + 1) * TILE_SIZE;
  const H = (clampedTyMax - tyMin + 1) * TILE_SIZE;

  // Project lat/lng → pixel in this tile grid's coordinate space
  function project(lat: number, lng: number) {
    const x = lngToTileX(lng, zoom) * TILE_SIZE - txMin * TILE_SIZE;
    const y = latToTileY(lat, zoom) * TILE_SIZE - tyMin * TILE_SIZE;
    return { x, y };
  }

  // Build tile list
  const tiles: { tx: number; ty: number; px: number; py: number }[] = [];
  for (let tx = txMin; tx <= clampedTxMax; tx++) {
    for (let ty = tyMin; ty <= clampedTyMax; ty++) {
      tiles.push({ tx, ty, px: (tx - txMin) * TILE_SIZE, py: (ty - tyMin) * TILE_SIZE });
    }
  }

  const polylinePoints = pts.map((s) => {
    const { x, y } = project(s.lat!, s.lng!);
    return `${x},${y}`;
  }).join(" ");

  // Pin radius / font scaled so they look ~14px / 11px at display size
  const displayW = 420;
  const scale = W / displayW;
  const pinR = 14 * scale;
  const pinFont = 11 * scale;
  const strokeW = 3 * scale;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={displayW}
      height={340}
      style={{ display: "block" }}
    >
      {/* OSM tile images */}
      {tiles.map(({ tx, ty, px, py }) => (
        <image
          key={`${tx}-${ty}`}
          href={`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`}
          x={px} y={py}
          width={TILE_SIZE} height={TILE_SIZE}
          preserveAspectRatio="none"
        />
      ))}
      {/* Route line */}
      {pts.length > 1 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth={strokeW}
          strokeDasharray={`${8 * scale} ${5 * scale}`}
          strokeOpacity="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Pins */}
      {pts.map((s) => {
        const { x, y } = project(s.lat!, s.lng!);
        const idx = stops.findIndex((st) => st.id === s.id);
        const color = STOP_COLORS[idx % STOP_COLORS.length];
        return (
          <g key={s.id} transform={`translate(${x},${y})`}>
            <circle r={pinR} fill={color} stroke="white" strokeWidth={strokeW * 0.8} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={pinFont}
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {idx + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RoutePage() {
  const [date, setDate] = useState(toISO(new Date()));
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const geocodingRef = useRef(false);

  useEffect(() => { loadJobs(date); }, [date]);

  async function loadJobs(iso: string) {
    setLoading(true);
    setStops([]);
    geocodingRef.current = false;

    const { data: jobs, error: jobErr } = await supabase
      .from("jobs")
      .select("id, title, customer_id, scheduled_time, scheduled_date, status")
      .eq("scheduled_date", iso);

    if (jobErr) console.error("jobs error:", jobErr);

    if (!jobs || jobs.length === 0) { setLoading(false); return; }

    const customerIds = [...new Set(jobs.map((j: any) => j.customer_id).filter(Boolean))];
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, name, address, city, state, zip")
      .in("id", customerIds);

    if (custErr) console.error("customers error:", custErr);

    const custMap: Record<string, any> = {};
    (customers ?? []).forEach((c: any) => { custMap[c.id] = c; });

    const initialStops: Stop[] = jobs.map((j: any) => {
      const c = custMap[j.customer_id] ?? {};
      const parts = [c.address, c.city, c.state, c.zip].filter(Boolean);
      return {
        id: j.id,
        title: j.title ?? "Untitled Job",
        customerName: c.name ?? "Unknown Customer",
        address: parts.join(", "),
        scheduledTime: j.scheduled_time ?? null,
        lat: null,
        lng: null,
        geocoding: parts.length > 0 ? "pending" : "failed",
      };
    });

    initialStops.sort((a, b) => {
      if (!a.scheduledTime && !b.scheduledTime) return 0;
      if (!a.scheduledTime) return 1;
      if (!b.scheduledTime) return -1;
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });

    setStops(initialStops);
    setLoading(false);

    geocodingRef.current = true;
    for (let i = 0; i < initialStops.length; i++) {
      if (!geocodingRef.current) break;
      const s = initialStops[i];
      if (s.geocoding !== "pending" || !s.address) continue;
      if (i > 0) await new Promise((r) => setTimeout(r, 1100));
      const coords = await geocode(s.address);
      setStops((prev) =>
        prev.map((p) =>
          p.id === s.id
            ? { ...p, lat: coords?.lat ?? null, lng: coords?.lng ?? null, geocoding: coords ? "done" : "failed" }
            : p
        )
      );
    }
  }

  function prevDay() {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(toISO(d));
  }
  function nextDay() {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    setDate(toISO(d));
  }

  function onDragStart(idx: number) { setDraggingIdx(idx); }
  function onDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx); }
  function onDrop(idx: number) {
    if (draggingIdx === null || draggingIdx === idx) { setDraggingIdx(null); setDragOverIdx(null); return; }
    const next = [...stops];
    const [moved] = next.splice(draggingIdx, 1);
    next.splice(idx, 0, moved);
    setStops(next);
    setDraggingIdx(null);
    setDragOverIdx(null);
  }

  function buildMapsUrl() {
    const addressed = stops.filter((s) => s.address);
    if (addressed.length === 0) return null;
    if (addressed.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressed[0].address)}`;
    }
    const destination = encodeURIComponent(addressed[addressed.length - 1].address);
    const waypoints = addressed.slice(0, -1).map((s) => encodeURIComponent(s.address)).join("|");
    return `https://www.google.com/maps/dir/?api=1&waypoints=${waypoints}&destination=${destination}`;
  }

  const mapsUrl = buildMapsUrl();
  const pendingGeocode = stops.filter((s) => s.geocoding === "pending").length;
  const geocodedCount = stops.filter((s) => s.geocoding === "done").length;
  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <Navigation className="w-5 h-5 text-ink-quiet" /> Route Planner
          </h1>
          <p className="text-[13px] text-ink-quiet mt-0.5">Drag stops to reorder, then open in Google Maps</p>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <Button className="w-auto gap-2">
              <Navigation className="w-4 h-4" /> Open in Google Maps
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </a>
        )}
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center border border-paper-deep rounded-xl overflow-hidden bg-white">
          <button onClick={prevDay} className="p-2.5 hover:bg-paper-warm transition-colors">
            <ChevronLeft className="w-4 h-4 text-ink-soft" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-[13px] font-semibold text-ink bg-transparent focus:outline-none min-w-[160px] text-center"
          />
          <button onClick={nextDay} className="p-2.5 hover:bg-paper-warm transition-colors">
            <ChevronRight className="w-4 h-4 text-ink-soft" />
          </button>
        </div>
        <span className="text-[13px] text-ink-quiet">{displayDate}</span>
        {pendingGeocode > 0 && (
          <span className="flex items-center gap-1.5 text-[12px] text-ink-quiet">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Locating {pendingGeocode} address{pendingGeocode !== 1 ? "es" : ""}…
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-ink-quiet">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Loading jobs…</span>
        </div>
      ) : stops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-paper-deep">
          <Briefcase className="w-10 h-10 text-ink-quiet opacity-30 mb-3" />
          <p className="text-[15px] font-semibold text-ink">No jobs scheduled for this date</p>
          <p className="text-[13px] text-ink-quiet mt-1">Pick a date that has scheduled jobs to build a route</p>
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* Stop list */}
          <div className="flex-1 bg-white rounded-2xl border border-paper-deep overflow-hidden">
            <div className="px-4 py-3 border-b border-paper-deep bg-paper-warm flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">{stops.length} Stop{stops.length !== 1 ? "s" : ""}</p>
              <p className="text-[12px] text-ink-quiet">Drag to reorder</p>
            </div>
            <div className="divide-y divide-paper-deep">
              {stops.map((stop, idx) => (
                <div
                  key={stop.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDrop={() => onDrop(idx)}
                  onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                  className={`flex items-center gap-3 px-4 py-3 select-none cursor-grab active:cursor-grabbing transition-colors ${
                    draggingIdx === idx ? "opacity-30 bg-paper-warm" : ""
                  } ${dragOverIdx === idx && draggingIdx !== idx ? "bg-blue-50 border-t-2 border-blue-400" : "hover:bg-paper-warm"}`}
                >
                  <GripVertical className="w-4 h-4 text-ink-quiet flex-shrink-0" />
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                    style={{ background: STOP_COLORS[idx % STOP_COLORS.length] }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/jobs/${stop.id}`} className="text-[13px] font-semibold text-ink truncate block hover:underline">
                      {stop.title}
                    </Link>
                    <p className="text-[12px] text-ink-quiet truncate">{stop.customerName}</p>
                    {stop.address ? (
                      <p className="text-[11px] text-ink-quiet truncate flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{stop.address}
                      </p>
                    ) : (
                      <p className="text-[11px] text-red-500 flex items-center gap-0.5 mt-0.5">
                        <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" /> No address on file — add it to the customer
                      </p>
                    )}
                    {stop.scheduledTime && (
                      <p className="text-[11px] text-ink-quiet flex items-center gap-0.5 mt-0.5">
                        <Clock className="w-2.5 h-2.5 flex-shrink-0" />{stop.scheduledTime}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {stop.geocoding === "pending" && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-quiet" />}
                    {stop.geocoding === "failed" && stop.address && (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" title="Could not locate this address" />
                    )}
                    {stop.address && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Directions
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {mapsUrl && (
              <div className="px-4 py-3 border-t border-paper-deep bg-paper-warm">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-paper-deep text-ink rounded-lg text-[13px] font-medium hover:bg-paper-warm transition-colors"
                >
                  <Navigation className="w-4 h-4" /> Open Full Route in Google Maps
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              </div>
            )}
          </div>

          {/* Map */}
          <div className="w-[420px] flex-shrink-0 bg-white rounded-2xl border border-paper-deep overflow-hidden">
            <div className="px-4 py-3 border-b border-paper-deep bg-paper-warm flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">Map</p>
              {geocodedCount > 0 && (
                <p className="text-[12px] text-ink-quiet">{geocodedCount} of {stops.length} located</p>
              )}
            </div>
            <div style={{ height: 340 }}>
              <InlineMap stops={stops} />
            </div>
            {/* Debug strip — shows address + geocode status for each stop */}
            <div className="px-4 py-3 border-t border-paper-deep space-y-1 max-h-40 overflow-y-auto">
              {stops.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 text-[11px]">
                  <span className="font-bold" style={{ color: STOP_COLORS[i % STOP_COLORS.length] }}>{i + 1}</span>
                  <span className="text-ink truncate flex-1">{s.address || <span className="text-red-400">no address</span>}</span>
                  <span className={s.geocoding === "done" ? "text-green-600" : s.geocoding === "failed" ? "text-red-500" : "text-amber-500"}>
                    {s.geocoding === "done" ? `✓ ${s.lat?.toFixed(3)},${s.lng?.toFixed(3)}` : s.geocoding === "failed" ? "failed" : "…"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
