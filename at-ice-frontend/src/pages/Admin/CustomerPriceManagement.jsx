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

const token = () => localStorage.getItem("token") || "";

const PRODUCT_LABELS = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};

const PRODUCT_ORDER = ["bags", "small_sack", "big_sack"];

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
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
    (!typeFilter || (typeFilter === "none" ? !r.customer_type : r.customer_type === typeFilter))
    && `${r.customer_name} ${r.chain || ""} ${r.branch_code || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const setCount = (row) =>
    PRODUCT_ORDER.filter((p) => row.prices[p] !== null && row.prices[p] !== undefined).length;

  const pager = usePagination(filteredRows);

  return (
    <AdminLayout pageTitle="Customer Prices" breadcrumb="CRM / Customer Prices">
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
            <option value="">All types</option>
            {Object.entries(CUSTOMER_TYPES).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
            <option value="none">Type not set</option>
          </select>
          <div className="flex items-center gap-2 bg-slate-50 border border-black/[0.09] rounded-lg px-3 py-1.5">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer..."
              className="bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-44"
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
                          {row.customer_type ? CUSTOMER_TYPES[row.customer_type]?.label : <span className="text-amber-600">Type not set: no reference price</span>}
                          {row.chain ? ` · ${row.chain}` : ""}
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
          Client-confirmed: Dealers, SM Malls (Supermarket / Mall) and Alfamart (Convenience Store). Restaurants have no reference price yet, so set each one's own price.
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
                    <div className="text-[11px] text-slate-400 max-w-[300px]">{t.examples}</div>
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
                          <button onClick={() => setConfirmApply(type)} className="px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]">Apply to all</button>
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
