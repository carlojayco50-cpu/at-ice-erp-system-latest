import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, BottomSheet, ActionBar, ErrorBanner, SuccessBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, FIELD, TEXTAREA, LABEL } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import { formatDateTime } from "../../lib/time";
import FilterSelect from "../../components/FilterSelect";

// Supplies and materials only. Ice is not inventoried.
const CATEGORIES = ["Packaging", "Truck Parts", "Machine Components", "Cleaning Supplies", "Other"];
const UNITS = ["pcs", "packs", "rolls", "boxes", "bundles", "liters", "sets"];
const EMPTY_ITEM = { name: "", category: "", unit: "pcs", minimum_stock: "", maximum_stock: "", description: "" };
const FILTERS = [["all", "All"], ["low", "Low"], ["out", "Out of stock"], ["alerts", "Alerts"]];

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

function stockStatus(current, min) {
  if (current <= 0) return { key: "out", label: "Out of stock", tone: "urgent" };
  if (current <= min) return { key: "low", label: "Low stock", tone: "pending" };
  return { key: "ok", label: "In stock", tone: "done" };
}

// Checker > Inventory: supplies stock levels, low stock alerts, and adding or
// editing an item (stock changes only through Stock in / out; Admin sets the
// minimum and maximum). ?filter=low|out|alerts picks the view.
export default function CheckerInventoryManagementPage() {
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some(([v]) => v === params.get("filter")) ? params.get("filter") : "all";
  const setFilter = (v) => setParams(v === "all" ? {} : { filter: v }, { replace: true });

  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [notice, setNotice] = useState("");

  const formDraft = useDraft("checker:item", { editing: null, form: EMPTY_ITEM }, { when: (v) => !!v.editing });
  const { editing, form } = formDraft.values; // editing: null = closed, {} = new, product = edit
  const { editing: setEditing, form: setForm } = formDraft.set;
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = editing && !editing.id;

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const load = useCallback(async () => {
    setError("");
    try {
      const h = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const [p, a] = await Promise.all([fetch("/api/products", { headers: h }), fetch("/api/inventory-alerts?status=all", { headers: h })]);
      if (!p.ok) throw new Error("Failed to load inventory.");
      const pd = await p.json();
      setProducts(Array.isArray(pd) ? pd : pd.data || []);
      if (a.ok) {
        const ad = await a.json();
        setAlerts(Array.isArray(ad) ? ad : ad.data || []);
      }
      setStatus("ready");
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
      setStatus("error");
    }
  }, [token]);
  const live = useLiveTick(["inventory", "stock-out"]);
  useEffect(() => { load(); }, [load, live]);

  function openNew() {
    setForm(EMPTY_ITEM);
    setFormError("");
    setEditing({});
  }
  function openEdit(p) {
    setForm({ name: p.name || "", category: p.category || "", unit: p.unit || "pcs", minimum_stock: p.minimum_stock ?? "", maximum_stock: p.maximum_stock ?? "", description: p.description || "" });
    setFormError("");
    setEditing(p);
  }

  async function saveItem(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    const name = form.name.trim();
    if (!name) return setFormError("Enter the item name.");
    setSaving(true);
    try {
      // Minimum and maximum stock are set by Admin only, so they are not sent.
      const res = await fetch(isNew ? "/api/products" : `/api/products/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, category: form.category.trim() || null, unit: form.unit.trim() || null, description: form.description.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not save this item."));
      setNotice(isNew ? `${name} added. Use Stock in to add its stock.` : `${name} updated.`);
      toast.success(isNew ? `${name} was added.` : `${name} was updated.`);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message || "Request failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function resolveAlert(a) {
    if (resolving) return;
    setResolving(a.id);
    try {
      const res = await fetch(`/api/inventory-alerts/${a.id}/resolve`, { method: "PUT", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not resolve this alert."));
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, is_resolved: true, resolved_at: new Date().toISOString() } : x)));
      toast.success("Alert was resolved.");
    } catch (e) {
      toast.error(e.message || "Request failed. Try again.");
    } finally {
      setResolving(null);
    }
  }

  const withStatus = useMemo(() => products.map((p) => ({ ...p, _s: stockStatus(p.current_stock ?? 0, p.minimum_stock ?? 0) })), [products]);
  const counts = { all: products.length, low: withStatus.filter((p) => p._s.key === "low").length, out: withStatus.filter((p) => p._s.key === "out").length, alerts: alerts.filter((a) => !a.is_resolved).length };
  const q = query.trim().toLowerCase();
  const visibleItems = withStatus
    .filter((p) => filter === "all" || p._s.key === filter)
    .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
    .sort((a, b) => ({ out: 0, low: 1, ok: 2 }[a._s.key] - { out: 0, low: 1, ok: 2 }[b._s.key]));
  const visibleAlerts = alerts.filter((a) => showResolved || !a.is_resolved);

  return (
    <RoleShell
      role="checker"
      title="Inventory"
      actionBar={filter !== "alerts" ? <ActionBar><LoadingButton onClick={openNew} disabled={timedIn === false}><Icon name="plus" /> Add item</LoadingButton></ActionBar> : null}
    >
      <TimeInNotice timedIn={timedIn} />
      <SuccessBanner>{notice}</SuccessBanner>

      <FilterSelect label="Show" value={filter} onChange={setFilter} className="w-full [&>select]:flex-1"
        options={FILTERS.map(([v, label]) => ({ value: v, label, count: counts[v] }))} />

      {filter !== "alerts" && (
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or category" aria-label="Search items" className={`${FIELD} pl-10`} />
        </div>
      )}

      {status === "loading" && <CardSkeleton rows={4} />}
      {status === "error" && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {status === "ready" && filter !== "alerts" && (
        visibleItems.length === 0 ? (
          <EmptyCard icon={q ? "search" : "box"} title={q ? "No match" : "No items here"}>
            {q ? "No item matches your search." : filter === "all" ? "Tap Add item to create the first one." : "Nothing in this group."}
          </EmptyCard>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {visibleItems.map((p) => (
              <article key={p.id} className={`${CARD} ${p._s.key === "out" ? "border-rose-200" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-slate-900">{p.name}</h2>
                    <div className="text-[13px] text-slate-500">{[p.product_code, p.category || "Uncategorized", p.unit].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold tabular-nums text-slate-900 leading-none">{p.current_stock ?? 0}</div>
                    <div className="text-[12px] text-slate-400 mt-1">min {p.minimum_stock ?? 0}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3">
                  <StatusBadge tone={p._s.tone}>{p._s.label}</StatusBadge>
                  <button type="button" onClick={() => openEdit(p)} className="min-h-[44px] px-3 -mr-2 inline-flex items-center gap-1.5 rounded-xl text-[14px] font-semibold text-cyan-700 active:scale-[0.98] transition-transform">
                    <Icon name="edit" size={16} /> Edit details
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      )}

      {status === "ready" && filter === "alerts" && (
        <>
          <label className="flex items-center gap-2 min-h-[44px] text-[14px] text-slate-600">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved alerts
          </label>
          {visibleAlerts.length === 0 ? (
            <EmptyCard icon="check" title="No active alerts">Every low stock alert is resolved.</EmptyCard>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {visibleAlerts.map((a) => (
                <article key={a.id} className={`${CARD} ${a.is_resolved ? "" : "border-rose-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-slate-900 truncate">{a.product?.name || "Unknown item"}</h2>
                      <div className="text-[13px] text-slate-500">{a.product?.current_stock ?? "—"} on hand · min {a.product?.minimum_stock ?? "—"}</div>
                      <div className="text-[12px] text-slate-400 mt-1">{a.is_resolved ? `Resolved ${formatDateTime(a.resolved_at, { year: false })}` : `Flagged ${formatDateTime(a.created_at, { year: false })}`}</div>
                    </div>
                    <StatusBadge tone={a.is_resolved ? "done" : "urgent"}>{a.is_resolved ? "Resolved" : "Low stock"}</StatusBadge>
                  </div>
                  {!a.is_resolved && (
                    <LoadingButton className="w-full mt-3" loading={resolving === a.id} disabled={!!resolving || timedIn === false} onClick={() => resolveAlert(a)}>
                      Mark resolved
                    </LoadingButton>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <BottomSheet
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={isNew ? "Add item" : "Edit item"}
        footer={<LoadingButton type="submit" form="item-form" loading={saving} disabled={timedIn === false}>{saving ? "Saving…" : isNew ? "Add item" : "Save changes"}</LoadingButton>}
      >
        <form id="item-form" onSubmit={saveItem} className="space-y-4" noValidate>
          <DraftHint draft={formDraft} />
          <ErrorBanner>{formError}</ErrorBanner>
          <div>
            <label htmlFor="item-name" className={LABEL}>Item name *</label>
            <input id="item-name" value={form.name} maxLength={255} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plastic bags (tube ice)" className={FIELD} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="item-cat" className={LABEL}>Category</label>
              <select id="item-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={FIELD}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                {form.category && !CATEGORIES.includes(form.category) && <option value={form.category}>{form.category} (old)</option>}
              </select>
            </div>
            <div>
              <label htmlFor="item-unit" className={LABEL}>Unit</label>
              <select id="item-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={FIELD}>
                <option value="">Choose…</option>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                {form.unit && !UNITS.includes(form.unit) && <option value={form.unit}>{form.unit} (old)</option>}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[14px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-400 text-[12px]">Minimum stock</div><div className="font-semibold text-slate-700">{isNew ? "Set by Admin" : form.minimum_stock === "" ? "—" : form.minimum_stock}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-slate-400 text-[12px]">Maximum stock</div><div className="font-semibold text-slate-700">{isNew ? "Set by Admin" : form.maximum_stock === "" ? "—" : form.maximum_stock}</div></div>
          </div>
          <div>
            <label htmlFor="item-desc" className={LABEL}>Description</label>
            <textarea id="item-desc" rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Size, brand, or where it is used" className={TEXTAREA} />
          </div>
          <p className="text-[13px] text-slate-500">
            {isNew ? "New items start at 0. Add stock through Stock in, which a second Checker confirms." : `Current stock: ${editing?.current_stock ?? 0}. Stock changes only through Stock in / out.`}
          </p>
        </form>
      </BottomSheet>
    </RoleShell>
  );
}
