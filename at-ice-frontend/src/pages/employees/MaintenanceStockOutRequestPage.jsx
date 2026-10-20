import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, BottomSheet, ActionBar, ErrorBanner, SuccessBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, FIELD, TEXTAREA, LABEL } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";

const STATUS_LABEL = { pending: "Pending", approved: "Approved", released: "Released", rejected: "Rejected" };
const FILTERS = [["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["released", "Released"], ["rejected", "Rejected"]];

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

// Maintenance > Parts: request truck parts or machine components from the
// inventory (Admin approves and releases them). ?status= picks the filter,
// ?new=1 opens the request form.
export default function MaintenanceStockOutRequestPage() {
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some(([v]) => v === params.get("status")) ? params.get("status") : "all";

  // The request form is kept as a draft while open, so a refresh keeps it.
  const draft = useDraft("stock-out:new", {
    showForm: false, productId: "", quantity: "", purpose: "", autoPurpose: "", projectId: "",
  }, { when: (v) => v.showForm });
  const { showForm, productId, quantity, purpose, autoPurpose, projectId } = draft.values;
  const {
    showForm: setShowForm, productId: setProductId, quantity: setQuantity, purpose: setPurpose,
    autoPurpose: setAutoPurpose, projectId: setProjectId,
  } = draft.set;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState("");
  const [projects, setProjects] = useState([]);
  const [notice, setNotice] = useState("");

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ?new=1 (from the home screen) opens the form once
  useEffect(() => {
    if (params.get("new") === "1") {
      setShowForm(true);
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [params, setParams, setShowForm]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/stock-out-requests", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
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
      const res = await fetch("/api/stock-out-items", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
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

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["stock-out", "inventory", "projects"]);
  useEffect(() => { fetchRequests(); }, [fetchRequests, live]);
  useEffect(() => { if (showForm) fetchItems(); }, [showForm, fetchItems, live]);

  const selectedItem = items.find((i) => String(i.id) === String(productId));

  // Choosing a project fills Purpose from its description (still editable).
  // Text the user typed is kept; text filled from a project is replaced.
  function chooseProject(id) {
    setProjectId(id);
    const desc = (projects.find((p) => String(p.id) === String(id))?.description || "").trim();
    const userTyped = purpose.trim() && purpose !== autoPurpose;
    if (userTyped) return;
    setPurpose(desc);
    setAutoPurpose(desc);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (!productId || !quantity) return setFormError("Choose an item and enter the quantity.");
    if (!purpose.trim()) return setFormError("Enter the purpose. Choosing a project fills it from the project description.");
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) return setFormError("Quantity must be a whole number, at least 1.");
    if (selectedItem && Number(quantity) > selectedItem.current_stock) {
      return setFormError(`Not enough stock. Available: ${selectedItem.current_stock} ${selectedItem.unit || ""}.`.trim());
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-out-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: Number(productId), quantity: Number(quantity), purpose: purpose.trim(), project_id: projectId ? Number(projectId) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(firstError(data, "Failed to submit request."));
      toast.success("Stock-out request was submitted.");
      setNotice("Request submitted. Waiting for Admin approval.");
      draft.clear();
      fetchRequests();
    } catch (err) {
      setFormError(err.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const setFilter = (v) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("status"); else next.set("status", v);
    setParams(next, { replace: true });
  };
  const visible = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const countOf = (v) => (v === "all" ? requests.length : requests.filter((r) => r.status === v).length);

  return (
    <RoleShell
      role="maintenance"
      title="Parts requests"
      actionBar={<ActionBar><LoadingButton disabled={timedIn === false} onClick={() => setShowForm(true)}><Icon name="plus" /> Request parts</LoadingButton></ActionBar>}
    >
      <TimeInNotice timedIn={timedIn} />
      <SuccessBanner>{notice}</SuccessBanner>

      {/* quick status filter */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="tablist" aria-label="Filter by status">
        {FILTERS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={`min-h-[44px] px-4 rounded-full border text-[14px] font-semibold whitespace-nowrap active:scale-[0.98] transition-transform ${filter === v ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
            {label} <span className="tabular-nums opacity-80">{countOf(v)}</span>
          </button>
        ))}
      </div>

      {loading && <CardSkeleton rows={3} />}
      {!loading && loadError && <ErrorBanner onRetry={fetchRequests}>{loadError}</ErrorBanner>}
      {!loading && !loadError && visible.length === 0 && (
        <EmptyCard icon="wrench" title={filter === "all" ? "No requests yet" : `No ${STATUS_LABEL[filter].toLowerCase()} requests`}>
          {filter === "all" ? "Tap Request parts to ask for an item." : "Try another filter."}
        </EmptyCard>
      )}

      {!loading && !loadError && (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((req) => (
            <article key={req.id} className={CARD}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-slate-900">{req.product?.name || req.item_name}</h2>
                  <div className="text-[14px] text-slate-500">Quantity: {req.quantity} {req.product?.unit || ""}</div>
                </div>
                <StatusBadge status={req.status}>{STATUS_LABEL[req.status] || req.status}</StatusBadge>
              </div>
              <p className="text-[14px] text-slate-600 mt-2">{req.purpose}</p>
              {req.project?.name && (
                <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[12px] font-semibold text-violet-700">
                  Project: {req.project.name}
                </div>
              )}
              <div className="text-[13px] text-slate-500 mt-2">
                {req.status === "pending" && "Waiting for Admin approval."}
                {req.status === "approved" && `Approved${req.approved_by?.name ? ` by ${req.approved_by.name}` : ""}. Waiting for Admin to release the item.`}
                {req.status === "released" && `Released${req.released_by?.name ? ` by ${req.released_by.name}` : ""}. Request completed.`}
              </div>
              {req.status === "rejected" && req.rejection_reason && (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[14px] text-rose-700">Reason: {req.rejection_reason}</div>
              )}
              <div className="text-[12px] text-slate-400 mt-3">{formatDateTime(req.created_at)}</div>
            </article>
          ))}
        </div>
      )}

      <BottomSheet
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        title="Request parts"
        footer={<LoadingButton type="submit" form="stock-out-form" loading={submitting} disabled={timedIn === false}>{submitting ? "Submitting…" : "Submit request"}</LoadingButton>}
      >
        <form id="stock-out-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DraftHint draft={draft} />
          <ErrorBanner>{formError}</ErrorBanner>
          <div>
            <label htmlFor="sor-item" className={LABEL}>Item *</label>
            <select id="sor-item" value={productId} onChange={(e) => setProductId(e.target.value)} className={FIELD}>
              <option value="">Choose an item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id} disabled={i.current_stock < 1}>{i.name} ({i.current_stock} {i.unit || ""} left)</option>
              ))}
            </select>
            <p className="text-[13px] text-slate-500 mt-1.5">
              {itemsError || (items.length === 0 ? "No items in the inventory yet. Ask the Checker to add the item first." : "The truck part or maintenance item you need.")}
            </p>
          </div>
          <div>
            <label htmlFor="sor-qty" className={LABEL}>Quantity *</label>
            <input id="sor-qty" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 2" value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} className={FIELD} />
          </div>
          <div>
            <label htmlFor="sor-project" className={LABEL}>Project (optional)</label>
            <select id="sor-project" value={projectId} onChange={(e) => chooseProject(e.target.value)} className={FIELD}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sor-purpose" className={LABEL}>Purpose *</label>
            <textarea id="sor-purpose" rows={3} placeholder="e.g. Delivery truck needs brake pad replacement" value={purpose}
              onChange={(e) => { setPurpose(e.target.value); setAutoPurpose(""); }} className={TEXTAREA} />
          </div>
        </form>
      </BottomSheet>
    </RoleShell>
  );
}
