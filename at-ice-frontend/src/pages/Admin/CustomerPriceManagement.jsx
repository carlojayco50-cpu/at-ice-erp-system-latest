import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonTableRows } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { useDraft } from "../../lib/useDraft";

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

      setRows((prev) =>
        prev.map((r) =>
          r.customer_id === customerId ? { ...r, prices: updated.prices } : r
        )
      );
      cancelEdit();
    } catch (err) {
      setError(err.message || "Could not save the prices.");
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = rows.filter((r) =>
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const setCount = (row) =>
    PRODUCT_ORDER.filter((p) => row.prices[p] !== null && row.prices[p] !== undefined).length;

  return (
    <AdminLayout pageTitle="Customer Prices" breadcrumb="CRM / Customer Prices">
      {/* Header */}
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Customer Prices</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Set the per-unit price each customer pays for Bags, Small Sack, and Big Sack.
              Salesman confirmations look up these prices automatically.
            </p>
          </div>
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
                filteredRows.map((row) => {
                  const isEditing = editingId === row.customer_id;
                  const complete = setCount(row) === 3;
                  const partial = setCount(row) > 0 && !complete;

                  return (
                    <tr
                      key={row.customer_id}
                      ref={isEditing ? focusRowRef : undefined}
                      className={`border-t border-black/[0.06] ${isEditing ? "bg-cyan-50/60" : ""}`}
                    >
                      <td className="px-[18px] py-2.5 text-slate-800">{row.customer_name}</td>

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
                            `₱${Number(row.prices[p]).toFixed(2)}`
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
                          <button
                            onClick={() => startEdit(row)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]"
                          >
                            <EditIcon />
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reference pricing note, per v25.7 client-confirmed table */}
      <div className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5">
        <h3 className="text-[13px] font-semibold text-slate-700 mb-2">Reference pricing (client-confirmed)</h3>
        <table className="text-[12px] font-mono text-slate-500">
          <tbody>
            <tr>
              <td className="pr-4 py-0.5 font-sans text-slate-600">Dealers</td>
              <td className="pr-3">Bags ₱45</td>
              <td className="pr-3">Small Sack ₱65</td>
              <td>Big Sack ₱108</td>
            </tr>
            <tr>
              <td className="pr-4 py-0.5 font-sans text-slate-600">SM Malls</td>
              <td className="pr-3">Bags ₱25</td>
              <td className="pr-3">Small Sack ₱150</td>
              <td>Big Sack ₱250</td>
            </tr>
            <tr>
              <td className="pr-4 py-0.5 font-sans text-slate-600">Alfamart</td>
              <td className="pr-3">Bags ₱24</td>
              <td className="pr-3 text-slate-300">Small Sack —</td>
              <td className="text-slate-300">Big Sack —</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 mt-2 font-sans">
          Alfamart's Small Sack / Big Sack pricing hasn't been provided by the client yet —
          follow up only if Alfamart ever orders sacks, not just bags.
        </p>
      </div>
    </AdminLayout>
  );
}