import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { ScopeStatusRow } from "../../components/NightMode";
import EmptyState from "../../components/EmptyState";

const ChevronLeftIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const WrenchIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M14.7 6.3a4 4 0 10-5.66 5.66L2 19l3 3 7.03-7.04a4 4 0 005.67-5.66l-2.83 2.83-2.12-2.12 2.83-2.83z" />
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const STATUS_STYLES = {
  pending:  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-600",  label: "Pending" },
  approved: { bg: "bg-cyan-50",   border: "border-cyan-200",   text: "text-cyan-600",   label: "Approved" },
  rejected: { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-500",    label: "Rejected" },
  released: { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-600",  label: "Released" },
};

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

export default function MaintenanceStockOutRequestPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // The inventory items that can be requested (GET /api/stock-out-items)
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState("");
  const [productId, setProductId] = useState("");
  const [notice, setNotice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purpose, setPurpose] = useState("");
  // Open projects on Admin's board (GET /api/project-options); optional
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/stock-out-requests", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(firstError(data, "Failed to load requests."));
      setRequests(data.data || data);
    } catch (err) {
      setLoadError(err.message || "Could not load your requests.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchItems = useCallback(async () => {
    setItemsError("");
    try {
      const res = await fetch("/api/stock-out-items", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(firstError(data, "Failed to load the items."));
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setItemsError(err.message || "Could not load the items.");
    }
    try {
      const res = await fetch("/api/project-options", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      const data = res.ok ? await res.json() : [];
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    }
  }, [token]);

  // Load on open
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["stock-out", "inventory", "projects"]);
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, live]);
  useEffect(() => {
    if (showForm) fetchItems();
  }, [showForm, fetchItems, live]);

  const selectedItem = items.find((i) => String(i.id) === String(productId));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!productId || !quantity || !purpose.trim()) {
      setFormError("Please fill in all fields.");
      return;
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      setFormError("Quantity must be a whole number, at least 1.");
      return;
    }
    if (selectedItem && Number(quantity) > selectedItem.current_stock) {
      setFormError(`Not enough stock. Available: ${selectedItem.current_stock} ${selectedItem.unit || ""}.`.trim());
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-out-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: Number(productId),
          quantity: Number(quantity),
          purpose: purpose.trim(),
          project_id: projectId ? Number(projectId) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(firstError(data, "Failed to submit request."));

      toast.success("Stock-out request was submitted.");
      setNotice("Request submitted. Waiting for Admin approval.");
      setProductId("");
      setQuantity("");
      setPurpose("");
      setProjectId("");
      setShowForm(false);
      fetchRequests();
    } catch (err) {
      setFormError(err.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* ── Top Bar ── */}
      <header className="bg-white border-b border-black/[0.08] px-4 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/maintenance/dashboard")}
            className="text-slate-400 active:text-slate-600 transition-colors p-1 -ml-1 cursor-pointer flex-shrink-0"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-semibold text-slate-800 leading-tight flex items-center gap-1.5">
              <WrenchIcon />
              Maintenance Parts Request
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Request truck parts or machine components
            </div>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 px-3 py-2 bg-cyan-500 active:bg-cyan-600 text-white text-[12px] font-semibold rounded-lg transition-colors cursor-pointer flex-shrink-0"
          >
            <PlusIcon />
            New
          </button>
        </div>
        <ScopeStatusRow />
      </header>

      {/* ── Collapsible Form ── */}
      {showForm && (
        <div className="bg-white border-b border-black/[0.08] px-4 py-4 flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Requested Item
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              >
                <option value="">Choose an item…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id} disabled={i.current_stock < 1}>
                    {i.name} ({i.current_stock} {i.unit || ""} left)
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-400 px-0.5">
                {itemsError
                  ? itemsError
                  : items.length === 0
                    ? "No items in the inventory yet. Ask the Checker to add the item first."
                    : "Choose the truck part or maintenance item you need from the inventory."}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 2"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sor-project" className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Project (optional)
              </label>
              <select
                id="sor-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="px-4 py-3 border border-black/[0.12] rounded-xl bg-slate-50/80 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 outline-none text-[14px] text-slate-800 transition-all"
              >
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="text-[11px] text-slate-400 px-0.5">The job this is for, from Admin's project board.</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
                Purpose
              </label>
              <textarea
                placeholder="e.g. Delivery truck DEL-002 needs brake pad replacement"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
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
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>
      )}

      {/* ── Request List ── */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {notice && (
          <div className="text-[12px] text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
            {notice}
          </div>
        )}
        {loading && (
          <SkeletonList />
        )}

        {loadError && !loading && (
          <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
            {loadError}
          </div>
        )}

        {!loading && !loadError && requests.length === 0 && (
          <EmptyState icon="clipboard">No maintenance requests yet. Tap "New" to submit one.</EmptyState>
        )}

        {!loading && requests.map((req) => {
          const style = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
          return (
            <div
              key={req.id}
              className="bg-white border border-black/[0.08] rounded-2xl shadow-sm px-4 py-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-slate-800">
                    {req.product?.name || req.item_name}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    Quantity: {req.quantity} {req.product?.unit || ""}
                  </div>
                </div>
                <span
                  className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border ${style.bg} ${style.border} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>

              <div className="text-[12px] text-slate-500 mt-2 leading-snug">
                {req.purpose}
              </div>
              {req.project?.name && (
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-[11px] font-medium text-violet-700">
                  Project: {req.project.name}
                </div>
              )}

              <div className="text-[11px] text-slate-400 mt-2">
                {req.status === "pending" && "Waiting for Admin approval"}
                {req.status === "approved" && `Approved${req.approved_by?.name ? ` by ${req.approved_by.name}` : ""}. Waiting for Admin to release the item.`}
                {req.status === "released" && `Released${req.released_by?.name ? ` by ${req.released_by.name}` : ""}. Request completed.`}
              </div>

              {req.status === "rejected" && req.rejection_reason && (
                <div className="mt-2 text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Reason: {req.rejection_reason}
                </div>
              )}

              <div className="flex items-center gap-1 text-[10px] text-slate-300 mt-3">
                <ClockIcon />
                {new Date(req.created_at).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          );
        })} 
      </div>
    </div>
  );
}