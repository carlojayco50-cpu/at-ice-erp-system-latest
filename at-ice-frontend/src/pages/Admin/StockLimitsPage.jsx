import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import EmptyState from "../../components/EmptyState";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { ActivityFeed, StatusBreakdown, TipsWidget } from "../../components/Insight";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { useDraft } from "../../lib/useDraft";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";

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

  const pager = usePagination(rows);

  // Stock health for the KPI cards and side panels
  const levelOf = (p) => {
    const cur = Number(p.current_stock ?? 0);
    const min = p.minimum_stock == null ? null : Number(p.minimum_stock);
    const max = p.maximum_stock == null ? null : Number(p.maximum_stock);
    if (cur <= 0) return "out";
    if (min != null && cur <= min) return "low";
    if (max != null && max > 0 && cur > max) return "over";
    return "ok";
  };
  const health = { ok: 0, low: 0, out: 0, over: 0 };
  products.forEach((p) => { health[levelOf(p)] += 1; });
  const noLimits = products.filter((p) => p.minimum_stock == null || p.maximum_stock == null).length;
  const lowest = [...products]
    .filter((p) => levelOf(p) === "out" || levelOf(p) === "low")
    .sort((a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0))
    .map((p) => ({
      id: p.id,
      title: p.name,
      meta: `${p.current_stock ?? 0} ${p.unit || ""} on hand · minimum ${p.minimum_stock ?? "not set"}`,
      tone: levelOf(p) === "out" ? "rose" : "amber",
      icon: "alert",
    }));
  const share = (n) => (products.length ? n / products.length : 0);

  return (
    <AdminLayout pageTitle="Stock Limits" breadcrumb="Inventory / Stock Limits">
      <KpiGrid cols={5}>
        <KpiCard label="Items" icon="box" tone="cyan" value={products.length} sub={`${noLimits} without limits set`} bar={share(products.length - noLimits)} />
        <KpiCard label="Healthy" icon="check" tone="emerald" value={health.ok} sub="Between minimum and maximum" bar={share(health.ok)} />
        <KpiCard label="Low stock" icon="alert" tone="amber" value={health.low} sub="At or under the minimum" bar={share(health.low)} />
        <KpiCard label="Out of stock" icon="x" tone="rose" value={health.out} sub="Nothing on hand" bar={share(health.out)} />
        <KpiCard label="Over maximum" icon="chart" tone="violet" value={health.over} sub="More than the maximum" bar={share(health.over)} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <div className="xl:col-span-8 min-w-0">
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
                {pager.pageItems.map((p) => (
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
            <Pagination pager={pager} />
          </div>
        )}
      </div>
      </div>

      <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0">
        <StatusBreakdown
          title="Stock health"
          items={[
            { label: "Healthy", count: health.ok, tone: "emerald" },
            { label: "Low stock", count: health.low, tone: "amber" },
            { label: "Out of stock", count: health.out, tone: "rose" },
            { label: "Over maximum", count: health.over, tone: "violet" },
          ]}
          empty="No inventory items yet. The Checker adds them."
        />
        <ActivityFeed title="Needs restocking" subtitle="Lowest first" items={lowest} empty="Every item is above its minimum." />
        <TipsWidget tips={[
          { title: "Minimum = alert level", text: "When an item reaches its minimum the Checker and you get a low stock alert.", tone: "amber", icon: "alert" },
          { title: "Maximum = room on the shelf", text: "Stock In above the maximum is flagged so supplies do not pile up.", tone: "violet", icon: "box" },
          ...(noLimits ? [{ title: `${noLimits} item${noLimits === 1 ? "" : "s"} without limits`, text: "Set both numbers so the alerts work for them too.", tone: "cyan", icon: "tag" }] : []),
        ]} />
      </aside>
      </div>
    </AdminLayout>
  );
}
