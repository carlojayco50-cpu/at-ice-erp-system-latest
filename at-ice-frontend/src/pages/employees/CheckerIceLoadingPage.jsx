import { useState, useEffect, useMemo } from "react";
import logo from "../../assets/logo.png";
import { useNavigate } from "react-router-dom";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import { ScopeStatusRow } from "../../components/NightMode";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import { formatDateTime } from "../../lib/time";

// Icons
const ChevronLeftIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const TruckIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const UserIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const token = () => localStorage.getItem("token") || "";

const PRODUCT_TYPES = [
  { key: "bags", label: "Bags", sub: "5kg" },
  { key: "small_sack", label: "Small Sack", sub: "30kg" },
  { key: "big_sack", label: "Big Sack", sub: "50kg" },
];

const PRODUCT_LABELS = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};

export default function CheckerIceLoadingPage() {
  const navigate = useNavigate();

  const [loadings, setLoadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // The count form is kept as a draft while open, so a refresh keeps it.
  const draft = useDraft("checker:ice-loading", {
    showForm: false, deliveryId: "", loadedAt: "", quantities: { bags: "", small_sack: "", big_sack: "" },
  }, { when: (v) => v.showForm });
  const { showForm, deliveryId, loadedAt, quantities } = draft.values;
  const { showForm: setShowForm, deliveryId: setDeliveryId, loadedAt: setLoadedAt, quantities: setQuantities } = draft.set;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Deliveries to count; one already counted (by either Checker) is disabled.
  const [deliveries, setDeliveries] = useState([]);
  const timedIn = useTimedIn();

  const total = useMemo(() => {
    return PRODUCT_TYPES.reduce((sum, p) => sum + (Number(quantities[p.key]) || 0), 0);
  }, [quantities]);

  const fetchLoadings = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/ice-loadings", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed to load ice loading counts.");
      const data = await res.json();
      setLoadings(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setLoadError(err.message || "Could not load ice loading counts.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      const res = await fetch("/api/ice-loadings/deliveries", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      /* the list stays as it was */
    }
  };

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => {
    fetchLoadings();
    fetchDeliveries();
  }, [live]);

  const chosen = deliveries.find((d) => String(d.id) === String(deliveryId));

  const resetForm = () => {
    setDeliveryId("");
    setLoadedAt("");
    setQuantities({ bags: "", small_sack: "", big_sack: "" });
    setFormError("");
  };

  const handleQuantityChange = (key, value) => {
    setQuantities((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (timedIn === false) {
      setFormError("Time in at the Attendance Station first. Saving is turned off until your Time In is recorded.");
      return;
    }
    if (!deliveryId || !loadedAt) {
      setFormError("Please choose the delivery and the loaded-at time.");
      return;
    }
    if (chosen?.loaded) {
      setFormError(`This delivery was already counted${chosen.loaded_by ? ` by ${chosen.loaded_by}` : ""}. A delivery can only be counted once.`);
      return;
    }
    if (total <= 0) {
      setFormError("Enter at least one quantity greater than zero.");
      return;
    }

    const items = PRODUCT_TYPES.map((p) => ({
      product_type: p.key,
      quantity: Number(quantities[p.key]) || 0,
    }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/ice-loadings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          delivery_id: Number(deliveryId),
          loaded_at: loadedAt,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409: the other Checker counted this delivery first.
        if (data.already_loaded) {
          toast.error("Already counted by the other Checker.");
          fetchDeliveries();
          fetchLoadings();
        }
        setFormError(data.message || "Failed to record ice loading. Please try again.");
        setSubmitting(false);
        return;
      }
      toast.success("Ice loading was recorded.");
      resetForm();
      setShowForm(false);
      fetchLoadings();
      fetchDeliveries();
    } catch {
      setFormError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  // Group individual rows (one per product type) into one card per
  // delivery_id + loaded_at "loading event", matching how they were submitted.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const rec of loadings) {
      const key = `${rec.delivery_id}__${rec.loaded_at}`;
      if (!map.has(key)) {
        map.set(key, {
          delivery_id: rec.delivery_id,
          loaded_at: rec.loaded_at,
          checkerName: rec.checker?.name,
          items: [],
          total: 0,
        });
      }
      const group = map.get(key);
      group.items.push(rec);
      group.total += rec.quantity_loaded;
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.loaded_at) - new Date(a.loaded_at)
    );
  }, [loadings]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* ── Top Bar ── */}
      <header className="bg-white border-b border-black/[0.09] flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/checker/dashboard")}
            className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            aria-label="Back to dashboard"
          >
            <ChevronLeftIcon />
          </button>
          <span className="brand-logo w-11 h-11 flex-shrink-0 rounded-lg flex items-center justify-center overflow-hidden"><img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-800 leading-tight">Ice Loading Count</div>
            <div className="text-[12px] text-slate-400 leading-tight">Count sacks loaded per delivery truck, by product type.</div>
          </div>
        </div>
        <ScopeStatusRow className="px-4 pb-3" />
        <div className="px-4 pb-4">

        <TimeInNotice timedIn={timedIn} className="mt-3" />

        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full mt-3 py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <PlusIcon />
          {showForm ? "Cancel" : "New Loading Count"}
        </button>
        </div>
      </header>

      {/* ── New Loading Count Form ── */}
      {showForm && (
        <div className="bg-white border-b border-black/[0.08] px-4 py-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <DraftHint draft={draft} onDiscard={() => setFormError("")} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ice-delivery" className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Delivery
              </label>
              <select
                id="ice-delivery"
                value={deliveryId}
                onChange={(e) => { setDeliveryId(e.target.value); setFormError(""); }}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              >
                <option value="">Choose a delivery…</option>
                {deliveries.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.loaded}>
                    {d.delivery_no || `DEL-${String(d.id).padStart(4, "0")}`}
                    {d.customer ? ` · ${d.customer}` : ""}
                    {d.loaded ? ` · already counted${d.loaded_by ? ` by ${d.loaded_by}` : ""}` : ""}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-400 px-0.5">
                {deliveries.length === 0
                  ? "No pending or in-transit deliveries right now."
                  : "Each delivery is counted once. Deliveries already counted by either Checker cannot be chosen."}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Loaded At
              </label>
              <input
                type="datetime-local"
                value={loadedAt}
                onChange={(e) => setLoadedAt(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[13px] text-slate-800 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Sacks Loaded, per type
              </label>
              <div className="flex flex-col gap-2">
                {PRODUCT_TYPES.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 border border-black/[0.12] rounded-xl bg-slate-50/80"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-slate-700">{p.label}</div>
                      <div className="text-[10px] text-slate-400">{p.sub}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={quantities[p.key]}
                      onChange={(e) => handleQuantityChange(p.key, e.target.value)}
                      className="w-20 text-right px-3 py-2 border border-black/[0.1] rounded-lg bg-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3 bg-cyan-50 border border-cyan-100 rounded-xl">
              <span className="text-[12px] font-medium text-cyan-700">Total Loaded</span>
              <span className="text-[16px] font-semibold font-mono text-cyan-700">{total} sacks</span>
            </div>

            {formError && (
              <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || timedIn === false || !!chosen?.loaded}
              className="w-full py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : "Save Count"}
            </button>
          </form>
        </div>
      )}

      {/* ── Loading Count List (grouped by delivery + time) ── */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {loading && (
          <SkeletonList />
        )}

        {!loading && loadError && (
          <div className="text-center text-[13px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-4">
            {loadError}
          </div>
        )}

        {!loading && !loadError && grouped.length === 0 && (
          <EmptyState icon="snow">No ice loading counts recorded yet.</EmptyState>
        )}

        {!loading &&
          grouped.map((group) => (
            <div
              key={`${group.delivery_id}__${group.loaded_at}`}
              className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm px-4 py-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-800 truncate">
                  DEL-{String(group.delivery_id).padStart(4, "0")}
                </span>
                <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600">
                  {group.total} total
                </span>
              </div>

              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400">
                <TruckIcon />
                <span>Delivery #{group.delivery_id}</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {group.items.map((item) => (
                  <span
                    key={item.id}
                    className="text-[11px] text-slate-600 bg-slate-100 rounded-full px-2.5 py-1"
                  >
                    {item.quantity_loaded} {PRODUCT_LABELS[item.product_type] || item.product_type || "Unspecified"}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-2.5 border-t border-black/[0.06] pt-2">
                {group.loaded_at && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <ClockIcon />
                    {formatDateTime(group.loaded_at, { year: false })}
                  </span>
                )}
                {group.checkerName && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <UserIcon />
                    {group.checkerName}
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}