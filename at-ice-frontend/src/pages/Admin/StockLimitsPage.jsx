import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import EmptyState from "../../components/EmptyState";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { useDraft } from "../../lib/useDraft";

// Minimum and maximum stock of each supply item. Only the Admin sets them
// (owner, 2026-10-16); the Checker sees them read-only on Inventory.
// Minimum stock is the low stock alert level.

const inputCls =
  "w-24 text-right px-2 py-1.5 border border-black/[0.09] rounded-md text-xs outline-none focus:border-cyan-400 bg-white tabular-nums";

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

export default function StockLimitsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Edited values per item id: { min, max }
  // Unsaved values survive a refresh.
  const limitsDraft = useDraft("stock-limits", { drafts: {} });
  const { drafts } = limitsDraft.values;
  const setDrafts = limitsDraft.set.drafts;
  const [savingId, setSavingId] = useState(null);

  const fetchProducts = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/products", {
        headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (!res.ok) throw new Error("Could not load the inventory items.");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError(e.message || "Could not load the inventory items.");
    } finally {
      setLoading(false);
    }
  }, []);

  const live = useLiveTick(["inventory"]);
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, live]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, search]);

  const valueOf = (p, key) => {
    const d = drafts[p.id];
    if (d && d[key] !== undefined) return d[key];
    return String((key === "min" ? p.minimum_stock : p.maximum_stock) ?? "");
  };
  const isChanged = (p) =>
    valueOf(p, "min") !== String(p.minimum_stock ?? "") || valueOf(p, "max") !== String(p.maximum_stock ?? "");
  const setDraft = (id, key, value) => setDrafts((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));

  async function save(p) {
    const min = Number(valueOf(p, "min"));
    const max = Number(valueOf(p, "max"));
    if (valueOf(p, "min") === "" || !Number.isInteger(min) || min < 0) return toast.error("Minimum stock must be a whole number, 0 or more.");
    if (valueOf(p, "max") === "" || !Number.isInteger(max) || max < 0) return toast.error("Maximum stock must be a whole number, 0 or more.");
    if (max < min) return toast.error("Maximum stock must be greater than or equal to the minimum stock.");

    setSavingId(p.id);
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({ minimum_stock: min, maximum_stock: max }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not save the stock limits."));
      setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, ...data } : x)));
      setDrafts((all) => {
        const next = { ...all };
        delete next[p.id];
        return next;
      });
      toast.success(`${p.name}: stock limits saved.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminLayout pageTitle="Stock Limits" breadcrumb="Inventory / Stock Limits">
      <div className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">Minimum and maximum stock</div>
            <div className="text-[11px] text-slate-400">
              Only the Admin sets these. Minimum stock is the low stock alert level. Checkers see them read-only.
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or category…"
              aria-label="Search item or category"
              className="px-3 py-2 border border-black/[0.09] rounded-md text-xs flex-1 min-w-0 sm:flex-none sm:w-56 outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => navigate("/admin/stock-out-approvals")}
              className="flex-shrink-0 px-3 py-2 border border-black/[0.09] text-slate-600 hover:text-slate-800 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Stock-Out Approvals
            </button>
          </div>
        </div>

        {loading && <SkeletonList />}
        {!loading && error && (
          <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState>{search ? "No item matches your search." : "No inventory items yet. The Checker adds them."}</EmptyState>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto -mx-[18px] px-[18px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 border-b border-black/[0.06]">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium text-right">On hand</th>
                  <th className="py-2 pr-3 font-medium text-right">Minimum</th>
                  <th className="py-2 pr-3 font-medium text-right">Maximum</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="py-2 pr-3 text-slate-800 font-medium">{p.name}</td>
                    <td className="py-2 pr-3 text-slate-500">{p.category || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                      {p.current_stock ?? 0} {p.unit || ""}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={valueOf(p, "min")}
                        onChange={(e) => setDraft(p.id, "min", e.target.value)}
                        className={inputCls}
                        aria-label={`Minimum stock of ${p.name}`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={valueOf(p, "max")}
                        onChange={(e) => setDraft(p.id, "max", e.target.value)}
                        className={inputCls}
                        aria-label={`Maximum stock of ${p.name}`}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => save(p)}
                        disabled={!isChanged(p) || savingId === p.id}
                        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-md text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingId === p.id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
