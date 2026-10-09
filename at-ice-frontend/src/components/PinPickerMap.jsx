import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Grab-style map pin for Add/Edit Customer. The pin stays in the middle and
// the admin drags the map under it; when the map stops, onChange gets the new
// latitude/longitude and the bubble shows the place name there (GET
// /api/places/reverse). Coordinates set from outside (picking a search
// result) move the map. "Lock pin" stops dragging so the pin cannot be moved
// by accident (zoom still works); "Change pin" unlocks it. Every time the
// admin moves the pin, onAddress gets the address under it so the form's
// address follows the pin. OpenStreetMap tiles: free, no key.
const DEFAULT_CENTER = [14.8139, 121.0453]; // San Jose del Monte

const toNum = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const near = (a, b) => Math.abs(a - b) < 1e-6;

// GET /api/places/reverse: { label, address: { street, barangay, city, ... } }
async function lookUp(lat, lng) {
  try {
    const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    });
    const data = await res.json().catch(() => null);
    return res.ok && data ? { label: data.label || "", address: data.address || null } : { label: "", address: null };
  } catch {
    return { label: "", address: null };
  }
}

export default function PinPickerMap({ latitude, longitude, onChange, onAddress }) {
  const boxRef = useRef(null);
  const [big, setBig] = useState(false);
  const mapRef = useRef(null);
  const propRef = useRef(null);
  const armedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onAddressRef = useRef(onAddress);
  const movedRef = useRef(null); // last spot the admin dragged the pin to
  const [moving, setMoving] = useState(false);
  const [label, setLabel] = useState("");
  const [locating, setLocating] = useState(false);

  const lat = toNum(latitude);
  const lng = toNum(longitude);
  const hasPin = lat !== null && lng !== null;
  // Locked = the map can still zoom but no longer moves the pin. A saved pin opens locked.
  const [locked, setLocked] = useState(hasPin);
  const lockedRef = useRef(locked);

  useEffect(() => { onChangeRef.current = onChange; onAddressRef.current = onAddress; }, [onChange, onAddress]);

  useEffect(() => {
    lockedRef.current = locked;
    const map = mapRef.current;
    if (!map) return;
    if (locked) { map.dragging.disable(); map.keyboard.disable(); } else { map.dragging.enable(); map.keyboard.enable(); }
    // Zooming while locked keeps the pin's spot in the middle.
    const zoom = locked ? "center" : true;
    map.options.scrollWheelZoom = zoom;
    map.options.doubleClickZoom = zoom;
    map.options.touchZoom = zoom;
  }, [locked]);

  // Create the map once.
  useEffect(() => {
    const zoom = locked ? "center" : true;
    const map = L.map(boxRef.current, {
      zoomControl: false, attributionControl: true,
      dragging: !locked, keyboard: !locked, scrollWheelZoom: zoom, doubleClickZoom: zoom, touchZoom: zoom,
    })
      .setView(hasPin ? [lat, lng] : DEFAULT_CENTER, hasPin ? 17 : 13);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    map.on("movestart", () => setMoving(true));
    map.on("dragstart", () => { armedRef.current = true; });
    map.on("moveend", () => {
      setMoving(false);
      const c = map.getCenter();
      const p = propRef.current;
      if (lockedRef.current) return; // pin locked: zooming only
      if (!p && !armedRef.current) return; // no pin yet: wait for the admin to drag
      if (p && near(c.lat, p.lat) && near(c.lng, p.lng)) return; // moved by us, not the admin
      movedRef.current = { lat: Number(c.lat.toFixed(7)), lng: Number(c.lng.toFixed(7)) };
      onChangeRef.current(c.lat.toFixed(7), c.lng.toFixed(7));
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current);
    mapRef.current = map;
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow coordinates set from outside, and look up the place name.
  useEffect(() => {
    propRef.current = hasPin ? { lat, lng } : null;
    if (!hasPin) { setLabel(""); return; }
    const map = mapRef.current;
    if (map) {
      const c = map.getCenter();
      if (!near(c.lat, lat) || !near(c.lng, lng)) map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: false });
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      const place = await lookUp(lat, lng);
      if (cancelled) return;
      setLabel(place.label);
      // Moved by the admin (not a saved pin or a search pick): update the address.
      const m = movedRef.current;
      if (place.address && m && near(m.lat, lat) && near(m.lng, lng)) onAddressRef.current?.(place.address);
    }, 500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [lat, lng, hasPin]);

  // Lock pin. The address already followed the pin (a lookup still running
  // finishes on its own), so typed edits such as a house number are kept.
  // Locking also closes the enlarged map.
  const lock = () => { if (hasPin) { setLocked(true); setBig(false); } };

  const locate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); armedRef.current = true; mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 18); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Enlarge: the map covers the page (Close or Esc shrinks it back).
  useEffect(() => {
    if (!big) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setBig(false); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [big]);

  const bubble = hasPin ? (label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`) : "Drag the map to the store";

  return (
    <>
    {big && <div className="fixed inset-0 z-[9998] bg-black/50" onClick={() => setBig(false)} />}
    <div
      className={`isolate overflow-hidden rounded-xl border border-black/[0.09] bg-slate-100 ${
        big ? "fixed inset-3 sm:inset-8 z-[9999] shadow-2xl" : "relative h-[260px]"
      }`}
    >
      <div ref={boxRef} className="absolute inset-0 z-0" />

      {/* Pin fixed in the middle; its tip marks the spot. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] flex flex-col items-center -translate-x-1/2 -translate-y-full">
        <div className={`mb-1.5 flex max-w-[240px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 shadow-lg transition-opacity ${moving ? "opacity-0" : "opacity-100"}`}>
          {locked && <LockIcon className="shrink-0 text-emerald-600" />}
          <span className="truncate">{bubble}</span>
        </div>
        <svg width="30" height="40" viewBox="0 0 30 40" className={`drop-shadow-md transition-transform ${moving ? "-translate-y-2" : ""}`}>
          <path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0z" fill="#ef4444" />
          <circle cx="15" cy="14.5" r="5.5" fill="#fff" />
        </svg>
      </div>
      <div className={`pointer-events-none absolute left-1/2 top-1/2 z-[499] h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30 transition-opacity ${moving ? "opacity-60" : "opacity-0"}`} />

      <button
        type="button"
        onClick={() => (locked ? setLocked(false) : lock())}
        disabled={!hasPin && !locked}
        className={`absolute left-2.5 bottom-2.5 z-[500] flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold shadow-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          locked ? "bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {locked ? <><UnlockIcon /> Change pin</> : <><LockIcon /> Lock pin</>}
      </button>

      <button
        type="button"
        onClick={() => setBig((v) => !v)}
        className="absolute left-2.5 top-2.5 z-[500] flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-lg cursor-pointer hover:bg-slate-50"
      >
        {big ? <><ShrinkIcon /> Close</> : <><EnlargeIcon /> Enlarge</>}
      </button>

      {!locked && <button
        type="button"
        onClick={locate}
        title="Go to my location"
        aria-label="Go to my location"
        className="absolute right-2.5 top-2.5 z-[500] grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-lg cursor-pointer hover:bg-slate-50"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={locating ? "animate-pulse" : ""}>
          <circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>}
    </div>
    {big && <div className="h-[260px]" />}{/* keeps the form from jumping */}
    </>
  );
}

const LockIcon = ({ className = "" }) => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className={className}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const EnlargeIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>;
const ShrinkIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>;
const UnlockIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>;
