import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { clearSession } from "../../lib/auth";
import { useLogoutConfirm } from "../../lib/useLogoutConfirm";
import { SkeletonList } from "../../components/Skeleton";
import HeaderAvatar from "../../components/HeaderAvatar";
import { ScopeStatusRow } from "../../components/NightMode";
import { initialsOf } from "../../lib/initials";
import { useLiveTick } from "../../lib/live";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import EmptyState from "../../components/EmptyState";

// Icons (unchanged)
const MapIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);
const NavIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);
const ChevronUpIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const MapPinIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const PackageIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const BackIcon = () => (
  <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

// Classic map pin shape for store markers, drawn with its tip at (0, 0) and the
// round head centered at (0, -29).
const STORE_PIN_PATH = "M 0,0 C -3,-9 -11,-17 -11,-29 A 11,11 0 1,1 11,-29 C 11,-17 3,-9 0,0 z";

// Backend status -> display label + colors. Panel shows ALL stops (Option 1),
// including "delivered" ones.
const STATUS_CONFIG = {
  pending:    { label: "Pending",    bg: "bg-amber-50",  text: "text-amber-600", dot: "bg-amber-400", markerFill: "#ef4444", markerStroke: "#dc2626", markerLabel: "!" },
  in_transit: { label: "In Transit", bg: "bg-blue-50",   text: "text-blue-600",  dot: "bg-blue-500",  markerFill: "#3b82f6", markerStroke: "#2563eb", markerLabel: "!" },
  delivered:  { label: "Delivered",  bg: "bg-green-50",  text: "text-green-600", dot: "bg-green-500", markerFill: "#22c55e", markerStroke: "#16a34a", markerLabel: "✓" },
  cancelled:  { label: "Cancelled",  bg: "bg-slate-100", text: "text-slate-400", dot: "bg-slate-300", markerFill: "#94a3b8", markerStroke: "#64748b", markerLabel: "×" },
};

function itemsSummary(delivery) {
  if (!Array.isArray(delivery.items) || delivery.items.length === 0) return "No items listed";
  return delivery.items
    .map((it) => `${it.product_label ?? it.product?.name ?? "Item"} × ${it.quantity_ordered}`)
    .join(", ");
}

// Escape text before it goes into the map popup's HTML, so a customer
// name or address containing HTML/script cannot run in the browser (XSS).
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

export function GpsTrackingPage() {
  const navigate = useNavigate();
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef     = useRef([]);
  const driverDotRef   = useRef(null);
  const watchIdRef     = useRef(null);
  const echoChannelRef = useRef(null);
  // Latest delivery list for the map code, which runs outside React renders
  // (Leaflet marker clicks).
  const storesRef      = useRef([]);

  const [driverPos, setDriverPos]         = useState(null);
  const [gpsStatus, setGpsStatus]         = useState("waiting");
  const [panelOpen, setPanelOpen]         = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [stores, setStores]               = useState([]);
  const [loading, setLoading]             = useState(true);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  // Counted separately so the header matches the Deliveries page
  // (previously "Pending" also included In Transit stops).
  const pending   = stores.filter((s) => s.status === "pending").length;
  const inTransit = stores.filter((s) => s.status === "in_transit").length;
  const delivered = stores.filter((s) => s.status === "delivered").length;

  // Sign out: clear the session first (same as the Deliveries page).
  // Previously this only navigated to the login page and kept the token.
  const handleLogout = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    clearSession();
    navigate("/login");
  };
  const [askLogout, logoutDialog] = useLogoutConfirm(handleLogout);

  const live = useLiveTick(["deliveries"]);

  // ── Fetch real deliveries (same endpoint DeliveriesPage.jsx uses) ─────────
  useEffect(() => {
    fetch("/api/driver/deliveries", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.deliveries ?? [];
        setStores(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // live: reloads on a delivery change and on pull-to-refresh
  }, [token, live]);

  // ── Live status updates via Pusher/Echo (same channel/event as
  // DeliveriesPage.jsx: public "deliveries" channel, "delivery.status.updated") ──
  useEffect(() => {
    if (!window.Echo) return;
    const channel = window.Echo.private("deliveries");
    echoChannelRef.current = channel;

    channel.listen(".delivery.status.updated", (e) => {
      // String comparison: the id can arrive as a number or a string
      if (String(e.driver_id) !== String(user?.id)) return;
      setStores((prev) =>
        prev.map((s) => (s.id === e.delivery_id ? { ...s, status: e.status } : s))
      );
    });

    return () => {
      window.Echo.leave("deliveries");
    };
  }, [user?.id]);


  // Map: Leaflet with OpenStreetMap tiles (free, no API key).
  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([14.66, 121.0], 13);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapInstanceRef.current = map;
    plotStoreMarkers(map);
    startGpsTracking(map);
  }

  function plotStoreMarkers(map) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    storesRef.current.forEach((store) => {
      if (store.customer?.latitude == null || store.customer?.longitude == null) return;
      const cfg = STATUS_CONFIG[store.status] ?? STATUS_CONFIG.pending;

      // Classic map pin: round head with a point at the bottom. The icon
      // anchor is the tip, so the pin points exactly at the store's
      // coordinates. The status symbol sits in the head.
      const icon = L.divIcon({
        className: "",
        iconSize: [26, 44],
        iconAnchor: [13, 43],
        popupAnchor: [0, -38],
        html: `<svg width="26" height="44" viewBox="-13 -43 26 44" aria-hidden="true">
          <path d="${STORE_PIN_PATH}" fill="${cfg.markerFill}" stroke="${cfg.markerStroke}" stroke-width="2"/>
          <text x="0" y="-25" text-anchor="middle" font-size="11" font-weight="bold" fill="#ffffff" font-family="system-ui,sans-serif">${cfg.markerLabel}</text>
        </svg>`,
      });

      const marker = L.marker([Number(store.customer.latitude), Number(store.customer.longitude)], {
        icon,
        title: store.customer?.name,
      }).addTo(map);

      // All customer text is escaped before it goes into the popup HTML
      marker.bindPopup(`
        <div style="font-family:'Inter','Segoe UI',sans-serif;font-size:12px;padding:2px;min-width:160px;">
          <div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${escapeHtml(store.customer?.name ?? "Customer")}</div>
          <div style="color:#64748b;margin-bottom:2px;">${escapeHtml(store.customer?.address ?? "")}</div>
          <div style="color:#64748b;">${escapeHtml(itemsSummary(store))}</div>
          <div style="margin-top:6px;display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;
            background:${cfg.bg === "bg-green-50" ? "#dcfce7" : "#fef3c7"};
            color:${cfg.markerStroke};">
            ${cfg.label}
          </div>
        </div>`);
      marker.on("click", () => setSelectedStore(store));

      markersRef.current.push(marker);
    });
  }

  function startGpsTracking(map) {
    if (!navigator.geolocation) { setGpsStatus("error"); return; }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setDriverPos({ lat, lng });
        setGpsStatus("active");
        if (driverDotRef.current) {
          driverDotRef.current.setLatLng([lat, lng]);
        } else {
          driverDotRef.current = L.circleMarker([lat, lng], {
            radius: 9,
            fillColor: "#06b6d4",
            fillOpacity: 1,
            color: "#0e7490",
            weight: 2,
          }).addTo(map).bindTooltip("Your Location");
          driverDotRef.current.bringToFront();
          map.panTo([lat, lng]);
        }
      },
      () => setGpsStatus("error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  // Keep the map pins in step with the delivery list. The map may be ready
  // before or after the deliveries arrive; either order ends with the pins
  // drawn, because initMap also plots from storesRef.
  useEffect(() => {
    storesRef.current = stores;
    if (mapInstanceRef.current) plotStoreMarkers(mapInstanceRef.current);
  }, [stores]);

  // Create the map once, keep it sized to its box, and remove it on leave
  useEffect(() => {
    initMap();
    const ro = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize());
    if (mapRef.current) ro.observe(mapRef.current);
    return () => {
      ro.disconnect();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      driverDotRef.current = null;
      markersRef.current = [];
    };
    // initMap only reads refs and state setters; this runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function centerOnDriver() {
    if (driverPos && mapInstanceRef.current) {
      mapInstanceRef.current.setView([driverPos.lat, driverPos.lng], 15);
    }
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {logoutDialog}

      {/* ── Top Bar ── */}
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="text-slate-400 active:text-slate-600 transition-colors cursor-pointer p-1 -ml-1 mr-1"
            >
              <BackIcon />
            </button>
            <div className="brand-logo w-11 h-11 flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-slate-800 leading-tight">{user?.name || "Driver"}</div>
              <div className="text-[11px] text-slate-400 tracking-wide">Driver</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${
              gpsStatus === "active"  ? "bg-green-50 border-green-200 text-green-600" :
              gpsStatus === "error"   ? "bg-red-50 border-red-200 text-red-500" :
                                        "bg-amber-50 border-amber-200 text-amber-600"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                gpsStatus === "active" ? "bg-green-500 animate-pulse" :
                gpsStatus === "error"  ? "bg-red-500" : "bg-amber-400 animate-pulse"
              }`} />
              {gpsStatus === "active" ? "GPS Active" : gpsStatus === "error" ? "GPS Error" : "Acquiring..."}
            </div>
            <HeaderAvatar initials={initialsOf(user?.name, "DR")} name={user?.name || "Driver"} subtitle={user?.email || "Driver"} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>

        <ScopeStatusRow />
        <div className="mt-3">
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">GPS Tracking</div>
          <div className="text-[12px] text-slate-400 mt-0.5">{todayLabel}</div>
        </div>

        <div className="flex gap-2 mt-3">
          {[
            { label: "Total Stops", value: stores.length, color: "text-slate-800" },
            { label: "Pending",     value: pending,       color: "text-amber-500" },
            { label: "In Transit",  value: inTransit,     color: "text-blue-500"  },
            { label: "Delivered",   value: delivered,     color: "text-green-500" },
          ].map((s) => (
            <div key={s.label} className="flex-1 bg-slate-50 border border-black/[0.08] rounded-xl px-2 py-2 text-center">
              <div className={`text-[16px] font-semibold font-mono leading-none ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-slate-400 mt-0.5 tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ── Map ── */}
      <div className="relative flex-1" style={{ minHeight: "320px" }}>
        <div ref={mapRef} className="absolute inset-0 w-full h-full z-0" />

        <button
          onClick={centerOnDriver}
          className="absolute top-3 right-3 z-10 w-10 h-10 bg-white border border-black/[0.10] rounded-xl shadow-md flex items-center justify-center text-cyan-500 active:bg-slate-50 transition-colors cursor-pointer"
        >
          <NavIcon />
        </button>

        <div className="absolute top-3 left-3 z-10 bg-white/95 border border-black/[0.08] rounded-xl px-3 py-2 flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0" />Your Location
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />Pending Stop
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />In Transit
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />Delivered
          </div>
        </div>

        {selectedStore && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-8px_20px_-6px_var(--neu-lo)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_CONFIG[selectedStore.status]?.dot}`} />
                  <span className="text-[13px] font-semibold text-slate-800 truncate">{selectedStore.customer?.name || "Unknown Customer"}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">
                  <MapPinIcon />{selectedStore.customer?.address || "No address on record"}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <PackageIcon />{itemsSummary(selectedStore)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_CONFIG[selectedStore.status]?.bg} ${STATUS_CONFIG[selectedStore.status]?.text}`}>
                  {STATUS_CONFIG[selectedStore.status]?.label}
                </span>
                <button
                  onClick={() => setSelectedStore(null)}
                  className="text-[11px] text-slate-400 active:text-slate-600 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Delivery Stops Panel — shows ALL stops, Delivered included (Option 1) ── */}
      <div className={`relative z-20 bg-white border-t border-black/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex-shrink-0 transition-all duration-300 overflow-hidden ${panelOpen ? "max-h-[280px]" : "max-h-[52px]"}`}>

        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer active:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
            <MapIcon />
            Delivery Stops
            <span className="text-[11px] font-normal text-slate-400 ml-1">{stores.length} stops today</span>
          </div>
          <span className="text-slate-400">{panelOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}</span>
        </button>

        <div className="overflow-y-auto px-4 pb-6 flex flex-col gap-2" style={{ maxHeight: "220px" }}>
          {loading && (
            <SkeletonList />
          )}
          {!loading && stores.length === 0 && (
            <EmptyState icon="truck" compact>No deliveries scheduled today.</EmptyState>
          )}
          {stores.map((store) => {
            const cfg = STATUS_CONFIG[store.status] ?? STATUS_CONFIG.pending;
            return (
              <button
                key={store.id}
                className="w-full text-left bg-slate-50 border border-black/[0.07] rounded-xl px-4 py-3 flex items-center gap-3 active:bg-slate-100 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedStore(store);
                  if (mapInstanceRef.current && store.customer?.latitude != null) {
                    mapInstanceRef.current.setView([Number(store.customer.latitude), Number(store.customer.longitude)], 15);
                  }
                }}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  {/* Fallback name: the old seed delivery has no customer */}
                  <div className="text-[12px] font-semibold text-slate-800 truncate">{store.customer?.name || "Unknown Customer"}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{store.customer?.address || store.delivery_no}</div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
