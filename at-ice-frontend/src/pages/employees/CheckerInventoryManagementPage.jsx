import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { ScopeStatusRow } from "../../components/NightMode";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import EmptyState from "../../components/EmptyState";
import { formatDateTime } from "../../lib/time";

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
);

// Supplies and materials only. Ice is not inventoried.
const CATEGORIES = ["Packaging", "Truck Parts", "Machine Components", "Cleaning Supplies", "Other"];
const UNITS = ["pcs", "packs", "rolls", "boxes", "bundles", "liters", "sets"];

const EMPTY_ITEM = { name: "", category: "", unit: "pcs", minimum_stock: "", maximum_stock: "", description: "" };

const inputCls =
  "w-full text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400 bg-white";

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

function stockStatus(current, min) {
  if (current <= 0) return { label: "Out of stock", tone: "red" };
  if (current <= min) return { label: "Low stock", tone: "amber" };
  return { label: "In stock", tone: "default" };
}

const toneClasses = {
  red: { text: "text-red-500", badge: "bg-red-50 text-red-600 border-red-200" },
  amber: { text: "text-amber-600", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  default: { text: "text-slate-800", badge: "bg-slate-50 text-slate-500 border-black/[0.09]" },
};

function fmtDate(d) {
  if (!d) return "";
  return formatDateTime(d, { year: false });
}

const ALERT_TABS = ["Active", "Resolved", "All"];

export default function CheckerInventoryManagementPage() {
  const navigate = useNavigate();
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");

  // Top-level view: "items" or "alerts"
  const [view, setView] = useState("items");

  // Items tab state
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState("");

  // Alerts tab state
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertTab, setAlertTab] = useState("Active");
  const [resolving, setResolving] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Add / edit item
  // Kept as a draft while the modal is open, so a refresh reopens it as it was.
  const formDraft = useDraft("checker:item", { editing: null, form: EMPTY_ITEM }, { when: (v) => !!v.editing });
  const { editing, form } = formDraft.values; // editing: null = closed, {} = new, product = edit
  const { editing: setEditing, form: setForm } = formDraft.set;
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = editing && !editing.id;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  function openNew() {
    setForm(EMPTY_ITEM);
    setFormError("");
    setEditing({});
  }

  function openEdit(p) {
    setForm({
      name: p.name || "",
      category: p.category || "",
      unit: p.unit || "pcs",
      minimum_stock: p.minimum_stock ?? "",
      maximum_stock: p.maximum_stock ?? "",
      description: p.description || "",
    });
    setFormError("");
    setEditing(p);
  }

  async function saveItem(e) {
    e.preventDefault();
    setFormError("");

    const name = form.name.trim();
    if (!name) return setFormError("Enter the item name.");

    // Minimum and maximum stock are set by Admin only (Admin > Stock Limits),
    // so they are not sent from here.
    const payload = {
      name,
      category: form.category.trim() || null,
      unit: form.unit.trim() || null,
      description: form.description.trim() || null,
    };

    setSaving(true);
    try {
      const res = await fetch(isNew ? "/api/products" : `/api/products/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not save this item."));
      setNotice(isNew ? `${name} added. Use Stock In to add its stock.` : `${name} updated.`);
      toast.success(isNew ? `${name} was added.` : `${name} was updated.`);
      setEditing(null);
      fetchProducts();
    } catch (err) {
      setFormError(err.message || "Request failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setError("");
    try {
      const res = await fetch("/api/products", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load inventory.");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setLoadingProducts(false);
    }
  }, [token]);

  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      // ?status=all so this one fetch covers Active, Resolved, and All tabs
      // client-side — matches the backend's status query param.
      const res = await fetch("/api/inventory-alerts?status=all", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return; // non-fatal — alerts tab will just show empty
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : data.data || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingAlerts(false);
    }
  }, [token]);

  // Load on open
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["inventory", "stock-out"]);
  useEffect(() => {
    fetchProducts();
    fetchAlerts();
  }, [fetchProducts, fetchAlerts, live]);

  async function resolveAlert(id) {
    setResolving(id);
    setError("");
    try {
      const res = await fetch(`/api/inventory-alerts/${id}/resolve`, {
        method: "PUT",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not resolve this alert."));
      fetchAlerts();
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setResolving(null);
    }
  }

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [products, query]);

  const counts = useMemo(() => {
    let low = 0, out = 0;
    for (const p of products) {
      const s = stockStatus(p.current_stock ?? 0, p.minimum_stock ?? 0);
      if (s.tone === "red") out++;
      else if (s.tone === "amber") low++;
    }
    return { low, out, total: products.length };
  }, [products]);

  const activeAlertCount = useMemo(
    () => alerts.filter((a) => !a.is_resolved).length,
    [alerts]
  );

  const filteredAlerts = alerts.filter((a) => {
    if (alertTab === "All") return true;
    if (alertTab === "Active") return !a.is_resolved;
    return !!a.is_resolved; // Resolved
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-black/[0.09]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/checker/dashboard")}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeftIcon />
          </button>
          <span className="brand-logo w-11 h-11 flex-shrink-0 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"><img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-800 leading-tight">
              Inventory Management
            </div>
            <div className="text-[12px] text-slate-400 leading-tight">
              Supplies &amp; materials stock levels
            </div>
          </div>
        </div>
        <ScopeStatusRow className="px-4 pb-3" />
        <TimeInNotice timedIn={timedIn} className="mx-4 mb-3" />

        {/* View tabs */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => setView("items")} aria-pressed={view === "items"}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
              view === "items"
                ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                : "border-black/[0.09] text-slate-500"
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setView("alerts")} aria-pressed={view === "alerts"}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
              view === "alerts"
                ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                : "border-black/[0.09] text-slate-500"
            }`}
          >
            Low Stock Alert{activeAlertCount > 0 ? ` (${activeAlertCount})` : ""}
          </button>
        </div>

        {view === "items" && (
          <>
            <div className="px-4 pb-3 flex items-center gap-4 text-[12px] text-slate-500">
              <span>{counts.total} items</span>
              {counts.low > 0 && <span className="text-amber-600 font-medium">{counts.low} low stock</span>}
              {counts.out > 0 && <span className="text-red-500 font-medium">{counts.out} out of stock</span>}
              <div className="flex-1" />
              <button
                onClick={openNew}
                className="flex items-center gap-1 text-[12px] font-semibold bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                <PlusIcon /> Add Item
              </button>
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 border border-black/[0.09] rounded-lg px-3 py-2">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or category"
                  className="flex-1 text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </>
        )}

        {view === "alerts" && (
          <div className="px-4 pb-3 flex gap-2">
            {ALERT_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setAlertTab(t)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  alertTab === t
                    ? "border-slate-400 bg-slate-100 text-slate-700"
                    : "border-black/[0.09] text-slate-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="px-4 pt-3 text-[13px] text-red-500 text-center">{error}</div>}
      {notice && (
        <div className="mx-4 mt-3 max-w-2xl md:mx-auto md:w-full px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-[12px] text-green-700 text-center">
          {notice}
        </div>
      )}

      {/* ── ALL ITEMS VIEW ── */}
      {view === "items" && (
        <div className="w-full px-4 py-4 flex flex-col gap-2.5 max-w-2xl mx-auto">
          {loadingProducts && (
            <SkeletonList />
          )}
          {!loadingProducts && filteredProducts.length === 0 && (
            <EmptyState icon={query ? "search" : "box"}>{query ? "No items match your search." : "No inventory items yet. Use Add Item to create one."}</EmptyState>
          )}

          {!loadingProducts &&
            filteredProducts.map((p) => {
              const status = stockStatus(p.current_stock ?? 0, p.minimum_stock ?? 0);
              const tone = toneClasses[status.tone];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
                    status.tone === "red" ? "border-red-200 bg-red-50/40" : "border-black/[0.09] bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-slate-800 truncate">{p.name}</div>
                    <div className="text-[12px] text-slate-400 mt-0.5">
                      {p.product_code ? `${p.product_code} · ` : ""}
                      {p.category || "Uncategorized"}
                      {p.unit ? ` · ${p.unit}` : ""}
                    </div>
                    <button
                      onClick={() => openEdit(p)}
                      className="mt-2 text-[11px] font-medium text-cyan-600 hover:text-cyan-700"
                    >
                      Edit details
                    </button>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[18px] font-semibold font-mono leading-none ${tone.text}`}>
                      {p.current_stock ?? 0}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">min {p.minimum_stock ?? 0}</div>
                    <span className={`inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${tone.badge}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── LOW STOCK ALERT VIEW ── */}
      {view === "alerts" && (
        <div className="w-full px-4 py-4 flex flex-col gap-2.5 max-w-2xl mx-auto">
          {loadingAlerts && (
            <SkeletonList />
          )}
          {!loadingAlerts && filteredAlerts.length === 0 && (
            <EmptyState icon="bell">No {alertTab.toLowerCase() !== "all" ? alertTab.toLowerCase() : ""} alerts.</EmptyState>
          )}

          {!loadingAlerts &&
            filteredAlerts.map((a) => {
              const isActive = !a.is_resolved;
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
                    isActive ? "border-red-200 bg-red-50/40" : "border-black/[0.09] bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-slate-800 truncate">
                      {a.product?.name || "Unknown product"}
                    </div>
                    <div className="text-[12px] text-slate-400 mt-0.5">
                      {isActive ? `Flagged ${fmtDate(a.created_at)}` : `Resolved ${fmtDate(a.resolved_at)}`}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1 font-mono">
                      {a.product?.current_stock ?? "—"} on hand · min {a.product?.minimum_stock ?? "—"}
                    </div>
                  </div>

                  {isActive ? (
                    <button
                      onClick={() => resolveAlert(a.id)}
                      disabled={resolving === a.id || timedIn === false}
                      className="shrink-0 text-[13px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                      Resolved
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* ── ADD / EDIT ITEM ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.09]">
              <div className="text-[15px] font-semibold text-slate-800">{isNew ? "Add Item" : "Edit Item"}</div>
              <button onClick={() => !saving && setEditing(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <XIcon />
              </button>
            </div>

            <form onSubmit={saveItem} className="px-4 py-4 flex flex-col gap-3">
              <DraftHint draft={formDraft} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Item Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={255}
                  placeholder="e.g. Plastic Bags (Tube Ice)"
                  className={inputCls}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={inputCls}
                    aria-label="Category"
                  >
                    <option value="">Choose a category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    {form.category && !CATEGORIES.includes(form.category) && (
                      <option value={form.category}>{form.category} (old)</option>
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Unit</span>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={inputCls}
                    aria-label="Unit"
                  >
                    <option value="">Choose a unit</option>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    {form.unit && !UNITS.includes(form.unit) && (
                      <option value={form.unit}>{form.unit} (old)</option>
                    )}
                  </select>
                </label>
              </div>

              {/* Read-only: only the Admin sets the minimum and maximum stock. */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Minimum Stock (low stock alert)</span>
                  <input
                    type="text"
                    readOnly
                    value={isNew ? "Set by Admin" : (form.minimum_stock === "" ? "—" : form.minimum_stock)}
                    className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`}
                    aria-label="Minimum stock, set by Admin"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Maximum Stock</span>
                  <input
                    type="text"
                    readOnly
                    value={isNew ? "Set by Admin" : (form.maximum_stock === "" ? "—" : form.maximum_stock)}
                    className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`}
                    aria-label="Maximum stock, set by Admin"
                  />
                </label>
              </div>
              <div className="text-[11px] text-slate-400 -mt-1">Only the Admin can set or change the minimum and maximum stock.</div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Description (optional)</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Size, brand, or where it is used"
                  className={`${inputCls} resize-none`}
                />
              </label>

              <div className="text-[11px] text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                {isNew
                  ? "New items start at 0 stock. Add stock through Stock In, which a second Checker must confirm."
                  : `Current stock: ${editing.current_stock ?? 0}. Stock can only be changed through Stock In or Stock Out, confirmed by a second Checker.`}
              </div>

              {formError && <div className="text-[12px] text-red-500">{formError}</div>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="flex-1 text-[13px] font-medium border border-black/[0.09] text-slate-600 rounded-lg py-2 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving || timedIn === false}
                  className="flex-1 text-[13px] font-semibold bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg py-2 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : isNew ? "Add Item" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}