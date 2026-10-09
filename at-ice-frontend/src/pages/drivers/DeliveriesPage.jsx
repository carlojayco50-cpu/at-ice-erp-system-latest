import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { clearSession } from "../../lib/auth";
import { useLogoutConfirm } from "../../lib/useLogoutConfirm";
import LeaveRequestButton from "../../components/LeaveRequestButton";
import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import HeaderAvatar from "../../components/HeaderAvatar";
import { ScopeStatusRow } from "../../components/NightMode";
import { initialsOf } from "../../lib/initials";
import EmptyState from "../../components/EmptyState";

// Pusher/Echo setup, created once at module load
window.Pusher = Pusher;
const echo = new Echo({
  broadcaster: "pusher",
  key: import.meta.env.VITE_PUSHER_APP_KEY,
  cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
  forceTLS: true,
});

// Haversine formula, gives straight line distance in km between two lat/lng points
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Icons
const MapPinIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const UserIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const PhoneIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 6.72 6.72l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const PackageIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const MapIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const STATUS_CONFIG = {
  pending:    { bg: "bg-amber-50",  text: "text-amber-600",  dot: "bg-amber-400",  label: "Pending"    },
  in_transit: { bg: "bg-blue-50",   text: "text-blue-600",   dot: "bg-blue-500",   label: "In Transit" },
  delivered:  { bg: "bg-green-50",  text: "text-green-600",  dot: "bg-green-500",  label: "Delivered"  },
};

const FILTERS = [
  { key: "all",        label: "All" },
  { key: "pending",    label: "Pending" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered",  label: "Delivered" },
];

export function DeliveriesPage() {
  const navigate = useNavigate();
  const [askLogout, logoutDialog] = useLogoutConfirm(() => {
    clearSession();
    navigate("/login");
  });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverPos, setDriverPos] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const watchIdRef = useRef(null);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const driverName = user?.name || "Driver";

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/driver/deliveries", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDeliveries(toList(data));
    } catch (err) {
      console.error("Failed to load deliveries:", err);
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries, live]);

  // Live GPS position, used only to compute an approximate distance to each stop
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setDriverPos(null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Real time updates via Pusher, on the public "deliveries" channel, event "delivery.status.updated"
  // Only apply updates that belong to this driver's own deliveries
  useEffect(() => {
    const channel = echo.channel("deliveries");
    channel.listen(".delivery.status.updated", (e) => {
      if (String(e.driver_id) !== String(user?.id)) return;
      setDeliveries((prev) =>
        prev.map((d) => (d.id === e.delivery_id ? { ...d, status: e.status } : d))
      );
    });
    return () => {
      echo.leaveChannel("deliveries");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Driver can only start a delivery. "Delivered" is confirmed by the Salesman.
  async function startDelivery(deliveryId) {
    setActionLoading(deliveryId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/driver/deliveries/${deliveryId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "in_transit" }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        console.error("Failed to start delivery:", res.status, errData);
        return;
      }
      const data = await res.json();
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? data.delivery : d))
      );
    } catch (err) {
      console.error("Network error starting delivery:", err);
    } finally {
      setActionLoading(null);
    }
  }

  const visible = filter === "all" ? deliveries : deliveries.filter((d) => d.status === filter);

  const counts = {
    total:      deliveries.length,
    pending:    deliveries.filter((d) => d.status === "pending").length,
    in_transit: deliveries.filter((d) => d.status === "in_transit").length,
    delivered:  deliveries.filter((d) => d.status === "delivered").length,
  };

  const SUMMARY = [
    { label: "Total",      value: counts.total,      color: "text-slate-800" },
    { label: "Pending",    value: counts.pending,    color: "text-amber-500" },
    { label: "In Transit", value: counts.in_transit, color: "text-blue-500"  },
    { label: "Delivered",  value: counts.delivered,  color: "text-green-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {logoutDialog}

      {/* Top bar */}
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="brand-logo w-11 h-11 flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-slate-800 leading-tight">{driverName}</div>
              <div className="text-[11px] text-slate-400 tracking-wide">Driver</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/driver/gps")}
              title="GPS map"
              aria-label="GPS map"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-600 text-[11px] font-medium active:bg-cyan-500/20 transition-colors cursor-pointer"
            >
              <MapIcon />
              {/* icon only on phones, so the row fits beside the name */}
              <span className="hidden sm:inline">GPS</span>
            </button>
            <LeaveRequestButton />
            <HeaderAvatar initials={initialsOf(user?.name, "DR")} name={user?.name || "Driver"} subtitle={user?.email || "Driver"} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>

        <ScopeStatusRow />
        <div className="mt-3">
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">My Deliveries</div>
        </div>

        <div className="flex gap-2 mt-3">
          {SUMMARY.map((s) => (
            // Tap a count to show only those deliveries (same as the tabs below)
            (() => {
              const key = s.label === "Total" ? "all" : FILTERS.find((f) => f.label === s.label)?.key;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setFilter(key)}
                  title={`Show ${s.label === "Total" ? "all" : s.label.toLowerCase()} deliveries`}
                  className={`stat-pill flex-1 bg-slate-50 border border-black/[0.08] rounded-xl px-2 py-2 text-center cursor-pointer ${filter === key ? "is-active" : ""}`}
                >
                  <div className={`text-[16px] font-semibold font-mono leading-none ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 tracking-wide">{s.label}</div>
                </button>
              );
            })()
          ))}
        </div>
      </header>

      {/* Filter tabs */}
      <div className="px-4 pt-4 flex-shrink-0">
        <div className="flex bg-slate-50 rounded-xl overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className="flex-1 whitespace-nowrap text-[12px] font-medium text-slate-500 cursor-pointer"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Delivery list */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {loading && (
          <SkeletonList />
        )}
        {!loading && visible.length === 0 && (
          <EmptyState icon="truck">No deliveries found.</EmptyState>
        )}
        {!loading && visible.map((d) => {
          const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
          const open = expanded === d.id;
          const customer = d.customer;
          const destination = customer
            ? [customer.address, customer.city, customer.province].filter(Boolean).join(", ")
            : "—";
          const itemsSummary = d.items?.length
            ? d.items.map((i) => `${i.product_label ?? i.product?.name ?? "Item"} × ${i.quantity_ordered}`).join(", ")
            : "—";
          const distanceKm = customer
            ? haversineDistanceKm(driverPos?.lat, driverPos?.lng, customer.latitude, customer.longitude)
            : null;

          return (
            <div key={d.id} className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm">

              <button
                className="w-full text-left px-4 py-4 flex items-start gap-3 cursor-pointer active:bg-slate-50 transition-colors"
                onClick={() => setExpanded(open ? null : d.id)}
              >
                <div className="mt-1 flex-shrink-0">
                  <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800 truncate">{customer?.name || "Unknown Customer"}</span>
                    <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                    <MapPinIcon />
                    <span className="truncate">{destination}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <ClockIcon />
                      {new Date(d.scheduled_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {distanceKm != null && (
                      <>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">{distanceKm.toFixed(1)} km</span>
                      </>
                    )}
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[10px] font-mono text-slate-400">{d.delivery_no}</span>
                  </div>
                </div>
                <span className={`text-slate-300 flex-shrink-0 mt-1 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
                  <ChevronRightIcon />
                </span>
              </button>

              {open && (
                <div className="border-t border-black/[0.07] px-4 py-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Customer</span>
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                        <UserIcon />{customer?.name || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Contact</span>
                      <div className="flex items-center gap-1.5 text-[12px] text-cyan-500 font-medium">
                        <PhoneIcon />{customer?.contact_number || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 col-span-2">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Destination</span>
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                        <MapPinIcon />{destination}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 col-span-2">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Items</span>
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                        <PackageIcon />{itemsSummary}
                      </div>
                    </div>
                  </div>

                  {d.status === "pending" && (
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => startDelivery(d.id)}
                        disabled={actionLoading === d.id}
                        className="flex-1 py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[12px] font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {actionLoading === d.id ? "Updating…" : "Start Delivery"}
                      </button>
                      <button
                        onClick={() => navigate("/driver/gps")}
                        className="flex-1 py-3 bg-slate-100 active:bg-slate-200 text-slate-600 text-[12px] font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        View on Map
                      </button>
                    </div>
                  )}
                  {d.status === "in_transit" && (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <span className="text-[12px] text-blue-600 font-medium">
                          On the way. The Salesman will confirm once the delivery is received.
                        </span>
                      </div>
                      <button
                        onClick={() => navigate("/driver/gps")}
                        className="w-full py-3 bg-slate-100 active:bg-slate-200 text-slate-600 text-[12px] font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        View on Map
                      </button>
                    </div>
                  )}
                  {d.status === "delivered" && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <span className="text-[12px] text-green-600 font-medium">Delivery completed successfully.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}