import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import { ScopeStatusRow } from "../../components/NightMode";

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
const ClipboardIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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

const PRODUCT_LABELS = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};

export default function CheckerPickupLogPage() {
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [productType, setProductType] = useState("bags");
  const [quantity, setQuantity] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/pickup-logs", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed to load pickup logs.");
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setLoadError(err.message || "Could not load pickup logs.");
    } finally {
      setLoading(false);
    }
  };

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["pickups"]);
  useEffect(() => {
    fetchLogs();
  }, [live]);

  const resetForm = () => {
    setCompanyName("");
    setProductType("bags");
    setQuantity("");
    setPickupDate("");
    setNotes("");
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!companyName.trim() || !quantity || !pickupDate) {
      setFormError("Please fill in company name, quantity, and pickup date.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pickup-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          product_type: productType,
          quantity: Number(quantity),
          pickup_date: pickupDate,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Failed to log pickup. Please try again.");
        setSubmitting(false);
        return;
      }
      toast.success("Pickup was logged.");
      resetForm();
      setShowForm(false);
      fetchLogs();
    } catch {
      setFormError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* ── Top Bar ── */}
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => navigate("/checker/dashboard")}
            className="text-slate-400 active:text-slate-600 transition-colors cursor-pointer p-1 -ml-1"
          >
            <ChevronLeftIcon />
          </button>
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">Pickup Log</div>
        </div>
        <ScopeStatusRow />
        <div className="text-[12px] text-slate-400 ml-7">
          Alexandra and J-Maxine ice pickups at the plant.
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full mt-3 py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <PlusIcon />
          {showForm ? "Cancel" : "New Pickup"}
        </button>
      </header>

      {/* ── New Pickup Form ── */}
      {showForm && (
        <div className="bg-white border-b border-black/[0.08] px-4 py-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Company Name
              </label>
              <input
                type="text"
                placeholder="Alexandra or J-Maxine"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Product Type
              </label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              >
                <option value="bags">Bags (5kg)</option>
                <option value="small_sack">Small Sack (30kg)</option>
                <option value="big_sack">Big Sack (50kg)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                  Pickup Date
                </label>
                <input
                  type="datetime-local"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[13px] text-slate-800 transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                placeholder="Any additional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all resize-none"
              />
            </div>

            {formError && (
              <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : "Save Pickup"}
            </button>
          </form>
        </div>
      )}

      {/* ── Pickup List ── */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {loading && (
          <SkeletonList />
        )}

        {!loading && loadError && (
          <div className="text-center text-[13px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-4">
            {loadError}
          </div>
        )}

        {!loading && !loadError && logs.length === 0 && (
          <EmptyState icon="clipboard">No pickups logged yet.</EmptyState>
        )}

        {!loading &&
          logs.map((log) => (
            <div key={log.id} className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-800 truncate">
                  {log.company_name}
                </span>
                <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600">
                  {PRODUCT_LABELS[log.product_type] || log.product_type}
                </span>
              </div>

              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400">
                <ClipboardIcon />
                <span>Quantity: {log.quantity}</span>
              </div>

              <div className="flex items-center gap-3 mt-1.5">
                {log.pickup_date && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <ClockIcon />
                    {new Date(log.pickup_date).toLocaleString("en-PH", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {log.recorded_by && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <UserIcon />
                    {log.recorded_by?.name}
                  </span>
                )}
              </div>

              {log.notes && (
                <div className="text-[11px] text-slate-500 mt-2 leading-snug border-t border-black/[0.06] pt-2">
                  {log.notes}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}