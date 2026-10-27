import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonTableRows } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { useDraft } from "../../lib/useDraft";
import { toast } from "../../lib/toast";
import { CUSTOMER_TYPES } from "../../lib/customerTypes";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { MiniBars, StatusBreakdown, TipsWidget } from "../../components/Insight";
import { Icon } from "../../components/icons";

const token = () => localStorage.getItem("token") || "";

const PRODUCT_LABELS = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};

const PRODUCT_ORDER = ["bags", "small_sack", "big_sack"];

function SearchIcon() {
  return (
    <Icon name="search" size={14} />
  );
}

function EditIcon() {
  return (
    <Icon name="edit" size={14} />
  );
}

function CheckIcon() {
  return (
    <Icon name="check" size={14} />
  );
}

function XIcon() {
  return (
    <Icon name="x" size={14} />
  );
}

export default function CustomerPriceManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // The row being edited and its typed prices survive a refresh.
  const priceDraft = useDraft("prices:edit", { editingId: null, draft: { bags: "", small_sack: "", big_sack: "" } }, { when: (v) => v.editingId != null });
  const { editingId, draft } = priceDraft.values;
  const { editingId: setEditingId, draft: setDraft } = priceDraft.set;
  const [saving, setSaving] = useState(false);

  // ?customer=ID (sent after Admin adds a customer): open that customer's
  // prices for editing once the list has loaded, then drop the parameter.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = Number(searchParams.get("customer")) || null;
  const focusRowRef = useRef(null);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["prices", "customers"]);
  useEffect(() => {
    fetchPrices();
  }, [live]);

  const startEdit = useCallback((row) => {
    setEditingId(row.customer_id);
    setDraft({
      bags: row.prices.bags ?? "",
      small_sack: row.prices.small_sack ?? "",
      big_sack: row.prices.big_sack ?? "",
    });
  }, [setEditingId, setDraft]);

  useEffect(() => {
    if (!focusId || loading) return;
    const row = rows.find((r) => r.customer_id === focusId);
    if (row) {
      startEdit(row);
      requestAnimationFrame(() => focusRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
    setSearchParams({}, { replace: true });
  }, [focusId, loading, rows, setSearchParams, startEdit]);

  async function fetchPrices() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customer-prices", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed to load customer prices.");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load prices.");
    } finally {
      setLoading(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({ bags: "", small_sack: "", big_sack: "" });
  }

  async function saveEdit(customerId) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/customer-prices/${customerId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          prices: {
            bags: draft.bags === "" ? null : Number(draft.bags),
            small_sack: draft.small_sack === "" ? null : Number(draft.small_sack),
            big_sack: draft.big_sack === "" ? null : Number(draft.big_sack),
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save prices.");
      const updated = await res.json();

      setRows((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...updated } : r)));
      toast.success(`Prices for ${updated.customer_name} were saved.`);
      cancelEdit();
    } catch (err) {
      setError(err.message || "Could not save the prices.");
    } finally {
      setSaving(false);
    }
  }

  // Back to the reference prices of the customer's type.
  async function resetPrices(row) {
    try {
      const res = await fetch(`/api/customer-prices/${row.customer_id}`, {
        method: "DELETE", headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Could not reset the prices.");
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.customer_id === row.customer_id ? { ...r, ...updated } : r)));
      toast.success(`${row.customer_name} now uses the reference prices.`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const filteredRows = rows.filter((r) =>
    (!typeFilter || (r.customer_type || "dealer") === typeFilter)
    && `${r.customer_name} ${r.branch_code || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const setCount = (row) =>
    PRODUCT_ORDER.filter((p) => row.prices[p] !== null && row.prices[p] !== undefined).length;

  const pager = usePagination(filteredRows);

  // Price coverage and averages for the KPI cards and panels
  const coverage = { complete: 0, partial: 0, none: 0 };
  rows.forEach((r) => {
    const n = setCount(r);
    coverage[n === PRODUCT_ORDER.length ? "complete" : n > 0 ? "partial" : "none"] += 1;
  });
  const avgOf = (p) => {
    const vals = rows.map((r) => r.prices[p]).filter((v) => v !== null && v !== undefined).map(Number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const share = (n) => (rows.length ? n / rows.length : 0);

  return (
    <AdminLayout pageTitle="Customer Prices" breadcrumb="CRM / Customer Prices">
      <KpiGrid cols={5}>
        <KpiCard label="Customers" icon="store" tone="cyan" value={rows.length} sub={`${coverage.complete} fully priced`} bar={share(coverage.complete)} />
        <KpiCard label="Complete" icon="check" tone="emerald" value={coverage.complete} sub="All three products priced" bar={share(coverage.complete)} />
        <KpiCard label="Partial" icon="clock" tone="amber" value={coverage.partial} sub="Some products priced" bar={share(coverage.partial)} />
        <KpiCard label="Unpriced" icon="alert" tone="rose" value={coverage.none} sub="No price for any product" bar={share(coverage.none)} />
        <KpiCard label="Average bag price" icon="tag" tone="violet" value={avgOf("bags")} money sub={`${PRODUCT_LABELS.bags}`} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <StatusBreakdown
          title="Price coverage"
          items={[
            { label: "Complete", count: coverage.complete, tone: "emerald" },
            { label: "Partial", count: coverage.partial, tone: "amber" },
            { label: "Unpriced", count: coverage.none, tone: "rose" },
          ]}
          empty="No customers yet."
        />
        <MiniBars
          title="Average price per product"
          subtitle="Across customers with a price set, in pesos"
          data={PRODUCT_ORDER.map((p) => ({ label: PRODUCT_LABELS[p].replace(/\s*\(.*\)/, ""), value: Math.round(avgOf(p)) }))}
        />
        <TipsWidget tips={[
          { title: "Reference prices fill the gaps", text: "A customer without its own price pays its type's reference price (table below).", tone: "cyan", icon: "tag" },
          { title: "Apply to all", text: "Removes the own prices of a whole type so everyone pays the reference prices.", tone: "violet", icon: "users" },
          ...(coverage.none ? [{ title: `${coverage.none} customer${coverage.none === 1 ? "" : "s"} unpriced`, text: "Their deliveries use the reference price until you set one.", tone: "amber", icon: "alert" }] : []),
        ]} />
      </div>

      {/* Header */}
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Customer Prices</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Each customer pays the reference price of its customer type unless you set its own price.
              Deliveries, contracts and Salesman invoices use these prices.
            </p>
          </div>
          <div className="flex items-center gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by customer type"
            className="bg-slate-50 border border-black/[0.09] rounded-lg px-2.5 py-1.5 text-[13px] text-slate-700 outline-none focus:border-cyan-500">
            <option value="">All types ({rows.length})</option>
            {Object.entries(CUSTOMER_TYPES).map(([v, t]) => <option key={v} value={v}>{t.label} ({rows.filter((r) => (r.customer_type || "dealer") === v).length})</option>)}
          </select>
          <div className="flex items-center gap-2 bg-slate-50 border border-black/[0.09] rounded-lg px-3 py-1.5">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer..."
              className="bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-full min-w-0 sm:w-60"
            />
          </div>
          </div>
        </div>

        {error && (
          <div className="mx-[18px] mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
                <th className="px-[18px] py-2.5 font-medium">Customer</th>
                {PRODUCT_ORDER.map((p) => (
                  <th key={p} className="px-[18px] py-2.5 font-medium">
                    {PRODUCT_LABELS[p]}
                  </th>
                ))}
                <th className="px-[18px] py-2.5 font-medium">Status</th>
                <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <SkeletonTableRows cols={6} />
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-[18px] py-8 text-center text-slate-400 text-[13px]">
                    {search ? "No customers match your search." : "No customers found."}
                  </td>
                </tr>
              )}

              {!loading &&
                pager.pageItems.map((row) => {
                  const isEditing = editingId === row.customer_id;
                  const complete = setCount(row) === 3;
                  const partial = setCount(row) > 0 && !complete;

                  return (
                    <tr
                      key={row.customer_id}
                      ref={isEditing ? focusRowRef : undefined}
                      className={`border-t border-black/[0.06] ${isEditing ? "bg-cyan-50/60" : ""}`}
                    >
                      <td className="px-[18px] py-2.5">
                        <div className="text-slate-800">{row.customer_name}{row.branch_code ? <span className="text-slate-400"> · {row.branch_code}</span> : null}</div>
                        <div className="text-[11px] text-slate-400">
                          {CUSTOMER_TYPES[row.customer_type || "dealer"]?.label}
                        </div>
                      </td>

                      {PRODUCT_ORDER.map((p) => (
                        <td key={p} className="px-[18px] py-2.5 font-mono text-slate-700">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">₱</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft[p]}
                                onChange={(e) => setDraft({ ...draft, [p]: e.target.value })}
                                placeholder="—"
                                className="w-20 bg-slate-50 border border-black/[0.09] rounded-md px-2 py-1 text-[13px] font-mono outline-none focus:border-cyan-500"
                              />
                            </div>
                          ) : row.prices[p] !== null && row.prices[p] !== undefined ? (
                            <div>
                              <div>₱{Number(row.prices[p]).toFixed(2)}</div>
                              <div className={`font-sans text-[10.5px] ${row.source?.[p] === "custom" ? "text-violet-600" : "text-slate-400"}`}>
                                {row.source?.[p] === "custom" ? "Own price" : "Reference"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">— not set</span>
                          )}
                        </td>
                      ))}

                      <td className="px-[18px] py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            complete
                              ? "bg-cyan-50 text-cyan-700"
                              : partial
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {complete ? "Complete" : partial ? "Partial" : "Unpriced"}
                        </span>
                      </td>

                      <td className="px-[18px] py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => saveEdit(row.customer_id)}
                              disabled={saving}
                              className="p-1.5 rounded-md bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
                              title="Save"
                            >
                              <CheckIcon />
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className="p-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200"
                              title="Cancel"
                            >
                              <XIcon />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end">
                            {Object.values(row.source || {}).includes("custom") && (
                              <button
                                onClick={() => resetPrices(row)}
                                title="Remove this customer's own prices and use the reference prices of its type"
                                className="px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]"
                              >
                                Use reference
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]"
                            >
                              <EditIcon />
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} />
      </div>

      <ReferencePrices onChanged={fetchPrices} />
    </AdminLayout>
  );
}
// Reference prices per customer type (client-confirmed table, v25.7), editable.
// "Apply to all" makes every customer of that type drop its own prices.
function ReferencePrices({ onChanged }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // customer type
  const [draft, setDraft] = useState({});
  const [confirmApply, setConfirmApply] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/reference-prices", { headers: jsonHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (alive && body) setData(body); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save(type) {
    const prices = Object.fromEntries(PRODUCT_ORDER.map((p) => [p, draft[p] === "" || draft[p] == null ? null : Number(draft[p])]));
    const res = await fetch(`/api/reference-prices/${type}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ prices }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return toast.error(body?.message || "Could not save the reference prices.");
    setData(body);
    setEditing(null);
    toast.success(`Reference prices for ${CUSTOMER_TYPES[type]?.label || type} were saved.`);
    onChanged();
  }

  // The spinner shows until the server answers, and at least 1 second so
  // the change can be seen; one click only (the button is locked meanwhile).
  async function apply(type) {
    if (applying) return;
    setApplying(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/reference-prices/${type}/apply`, { method: "POST", headers: jsonHeaders() }),
        new Promise((r) => setTimeout(r, 1000)),
      ]);
      const body = await res.json().catch(() => null);
      if (!res.ok) return toast.error(body?.message || "Could not apply the reference prices.");
      toast.success(body?.message || "Success: Changes applied to all items.");
      onChanged();
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setApplying(false);
      setConfirmApply(null);
    }
  }

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl">
      <div className="px-[18px] py-3.5 border-b border-black/[0.09]">
        <h3 className="text-[14px] font-semibold text-slate-800">Reference prices by customer type</h3>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Client-confirmed groups. Supermarkets, malls and big restaurant chains pay the SM Malls prices, convenience stores the Alfamart prices, and dealers and independent stores the Dealers prices. A blank price has not been given by the client yet.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
              <th className="px-[18px] py-2.5 font-medium">Customer type</th>
              {PRODUCT_ORDER.map((p) => <th key={p} className="px-[18px] py-2.5 font-medium">{PRODUCT_LABELS[p]}</th>)}
              <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!data && <SkeletonTableRows cols={5} />}
            {data && Object.entries(CUSTOMER_TYPES).map(([type, t]) => {
              const row = data.prices?.[type] || {};
              const on = editing === type;
              return (
                <tr key={type} className={`border-t border-black/[0.06] align-top ${on ? "bg-cyan-50/60" : ""}`}>
                  <td className="px-[18px] py-2.5">
                    <div className="text-slate-800">{t.label}</div>
                    <div className="text-[11px] text-slate-400 max-w-[300px] mx-auto">{t.examples}</div>
                  </td>
                  {PRODUCT_ORDER.map((p) => (
                    <td key={p} className="px-[18px] py-2.5 font-mono text-slate-700">
                      {on ? (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">₱</span>
                          <input type="number" min="0" step="0.01" value={draft[p] ?? ""} placeholder="—" aria-label={`${t.label} ${PRODUCT_LABELS[p]}`}
                            onChange={(e) => setDraft({ ...draft, [p]: e.target.value })}
                            className="w-20 bg-slate-50 border border-black/[0.09] rounded-md px-2 py-1 text-[13px] font-mono outline-none focus:border-cyan-500" />
                        </div>
                      ) : row[p] != null ? `₱${Number(row[p]).toFixed(2)}` : <span className="text-slate-300">— none</span>}
                    </td>
                  ))}
                  <td className="px-[18px] py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      {on ? (
                        <>
                          <button onClick={() => save(type)} className="p-1.5 rounded-md bg-cyan-500 text-white hover:bg-cyan-600" title="Save"><CheckIcon /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200" title="Cancel"><XIcon /></button>
                        </>
                      ) : (
                        <>
                          <button data-no-confirm onClick={() => setConfirmApply(type)} className="px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]">Apply to all</button>
                          <button onClick={() => { setEditing(type); setDraft({ ...row }); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]"><EditIcon /> Edit</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmApply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-black/[0.09] w-full max-w-sm p-5">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1.5">Use the reference prices for every {CUSTOMER_TYPES[confirmApply]?.label} customer?</h3>
            <p className="text-[12px] text-slate-500 mb-4">Their own prices are removed, so they all pay the reference prices from now on. Deliveries already made keep their prices.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmApply(null)} disabled={applying} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px] disabled:opacity-50">Back</button>
              <button onClick={() => apply(confirmApply)} disabled={applying} aria-busy={applying || undefined} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-80 disabled:cursor-wait">
                {applying && <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />}
                {applying ? "Applying…" : "Apply to all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function jsonHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` };
}
