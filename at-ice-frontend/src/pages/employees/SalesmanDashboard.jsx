import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { clearSession } from "../../lib/auth";
import { useLogoutConfirm } from "../../lib/useLogoutConfirm";
import LeaveRequestButton from "../../components/LeaveRequestButton";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import HeaderAvatar from "../../components/HeaderAvatar";
import { ScopeStatusRow } from "../../components/NightMode";
import { initialsOf } from "../../lib/initials";
import EmptyState from "../../components/EmptyState";

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
const CameraIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

// Helpers
const token = () => localStorage.getItem("token") || "";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const PRODUCT_LABEL = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG = {
  pending:    { bg: "bg-amber-50",  text: "text-amber-600",  dot: "bg-amber-400",  label: "Pending"    },
  in_transit: { bg: "bg-blue-50",   text: "text-blue-600",   dot: "bg-blue-500",   label: "In Transit" },
  delivered:  { bg: "bg-green-50",  text: "text-green-600",  dot: "bg-green-500",  label: "Delivered"  },
  cancelled:  { bg: "bg-slate-100", text: "text-slate-400",  dot: "bg-slate-300",  label: "Cancelled"  },
};

const FILTERS = ["All", "Pending", "In Transit", "Delivered"];

export default function SalesmanDashboard() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState(null);

  const fetchDeliveries = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/my-deliveries", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed to load deliveries.");
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setLoadError(err.message || "Could not load deliveries.");
    } finally {
      setLoading(false);
    }
  };

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => {
    fetchDeliveries();
  }, [live]);

  // Sign out: clear the session first (same as the Checker and Driver pages).
  // Previously this only navigated to the login page and kept the token.
  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };
  const [askLogout, logoutDialog] = useLogoutConfirm(handleLogout);

  const statusLabel = (s) => STATUS_CONFIG[s]?.label || s;
  const visible =
    filter === "All"
      ? deliveries
      : deliveries.filter((d) => statusLabel(d.status) === filter);

  const summary = [
    { label: "Total", value: deliveries.length, color: "text-slate-800" },
    { label: "Pending", value: deliveries.filter((d) => d.status === "pending").length, color: "text-amber-500" },
    { label: "In Transit", value: deliveries.filter((d) => d.status === "in_transit").length, color: "text-blue-500" },
    { label: "Delivered", value: deliveries.filter((d) => d.status === "delivered").length, color: "text-green-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {logoutDialog}

      {/* ── Top Bar ── */}
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="brand-logo w-11 h-11 flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center overflow-hidden">
             <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-slate-800 leading-tight">
                {JSON.parse(localStorage.getItem("user") || "{}")?.name || "Salesman"}
              </div>
              <div className="text-[11px] text-slate-400 tracking-wide">Salesman</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LeaveRequestButton />
            <HeaderAvatar initials={initialsOf(user?.name, "SA")} name={user?.name || "Salesman"} subtitle={user?.email || "Salesman"} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>

        <ScopeStatusRow />
        <div className="mt-3">
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">My Deliveries</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-2 mt-3">
          {summary.map((s) => (
            // Tap a count to show only those deliveries (same as the tabs below)
            <button
              key={s.label}
              type="button"
              onClick={() => setFilter(s.label === "Total" ? "All" : s.label)}
              title={`Show ${s.label === "Total" ? "all" : s.label.toLowerCase()} deliveries`}
              className={`stat-pill flex-1 bg-slate-50 border border-black/[0.08] rounded-xl px-2 py-2 text-center cursor-pointer ${filter === (s.label === "Total" ? "All" : s.label) ? "is-active" : ""}`}
            >
              <div className={`text-[16px] font-semibold font-mono leading-none ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-slate-400 mt-0.5 tracking-wide">{s.label}</div>
            </button>
          ))}
        </div>
      </header>

      {/* ── Filter Tabs ── */}
      <div className="px-4 pt-4 flex-shrink-0">
        <div className="flex bg-slate-50 rounded-xl overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)} aria-pressed={filter === f}
              className="flex-1 whitespace-nowrap text-[12px] font-medium text-slate-500 cursor-pointer"
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Delivery List ── */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {loading && (
          <SkeletonList />
        )}

        {!loading && loadError && (
          <div className="text-center text-[13px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-4">
            {loadError}
          </div>
        )}

        {!loading && !loadError && visible.length === 0 && (
          <EmptyState icon="truck">No deliveries found.</EmptyState>
        )}

        {!loading &&
          visible.map((d) => {
            const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
            const open = expanded === d.id;
            const storeName = d.store_name || d.customer?.name || "Store";
            const address = d.address || d.customer?.address || "—";
            // Real delivery number (DEL-0007). Previously this was built
            // from the database id, which showed DEL-0008 for id 8.
            const orderCode = d.delivery_no || `#${d.id}`;

            return (
              <div key={d.id} className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm">

                {/* Card header */}
                <button
                  className="w-full text-left px-4 py-4 flex items-start gap-3 cursor-pointer active:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(open ? null : d.id)}
                >
                  <div className="mt-1 flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{storeName}</span>
                      <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                      <MapPinIcon />
                      <span className="truncate">{address}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {d.created_at && (
                        <>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <ClockIcon />
                            {new Date(d.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-slate-300">·</span>
                        </>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">{orderCode}</span>
                    </div>
                  </div>
                  <span className={`text-slate-300 flex-shrink-0 mt-1 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
                    <ChevronRightIcon />
                  </span>
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="border-t border-black/[0.07] px-4 py-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest">Store</span>
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                          <UserIcon />{storeName}
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest">Address</span>
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                          <MapPinIcon />{address}
                        </div>
                      </div>
                      {Array.isArray(d.items) && d.items.length > 0 && d.status !== "delivered" && (
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Items</span>
                          <div className="flex items-center gap-1.5 text-[12px] text-slate-700 font-medium">
                            <PackageIcon />
                            {d.items
                              .map((item) => `${PRODUCT_LABEL[item.product_type] || item.product?.name || "Item"}${item.quantity_ordered ? ` (${item.quantity_ordered})` : ""}`)
                              .join(", ")}
                          </div>
                        </div>
                      )}
                    </div>
                      
                    {/* The salesman can confirm only after the driver has started the delivery. */}
                    {d.status === "pending" && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <span className="text-[12px] text-amber-700 font-medium">Waiting for the driver to start this delivery. You can confirm it once it is In Transit.</span>
                      </div>
                    )}
                    {d.status === "in_transit" && (
                      <button
                        onClick={() => navigate(`/salesman/deliveries/${d.id}/confirm`)}
                        className="w-full py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[12px] font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CameraIcon />
                        Confirm Delivery
                      </button>
                    )}

                    {d.status === "delivered" && <SubmittedProof delivery={d} />}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// What this Salesman submitted for a delivered stop: receipt, quantities,
// total and the proof photo.
function SubmittedProof({ delivery }) {
  const proof = (delivery.proofs || [])[0];
  const receipt = proof?.receipt;
  const items = receipt?.items || [];
  const when = proof?.confirmed_at || delivery.delivered_at;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-[12px] text-green-600 font-medium">
          Confirmed{when ? ` on ${new Date(when).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}. Sent to Admin.
        </span>
      </div>
      {receipt && (
        <div className="border border-black/[0.08] rounded-xl overflow-hidden">
          <div className="bg-slate-50 border-b border-black/[0.08] px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest">Receipt</span>
            <span className="text-[12px] font-mono font-semibold text-slate-800">{receipt.receipt_no || "—"}</span>
          </div>
          <div className="px-3 py-2 flex flex-col gap-1.5">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-[12px]">
                <span className="text-slate-600">{PRODUCT_LABEL[it.product_type] || it.product_type} × {it.quantity}</span>
                <span className="font-mono text-slate-700">{peso(it.line_total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[12px] font-semibold border-t border-black/[0.06] pt-1.5 mt-0.5">
              <span className="text-slate-700">Total</span>
              <span className="font-mono text-slate-800">{peso(receipt.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
      {proof?.photo_path && (
        <a href={`${BACKEND_URL}/storage/${proof.photo_path}`} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-black/[0.08]">
          <img src={`${BACKEND_URL}/storage/${proof.photo_path}`} alt="Proof of delivery" className="w-full max-h-48 object-cover" />
        </a>
      )}
    </div>
  );
}
