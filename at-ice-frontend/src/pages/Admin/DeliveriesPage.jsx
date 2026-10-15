import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonTableRows } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { toList } from "../../lib/list";
import { formatDateTime as dateTime12 } from "../../lib/time";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";

const API_BASE = "/api";
// Proof photos are on Laravel's public disk, served by the backend at /storage/.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const photoUrl = (path) => (path ? `${BACKEND_URL}/storage/${path}` : null);
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (v) => (v ? dateTime12(v) : "—");
const PAYMENT_BADGE = {
  paid: "bg-emerald-50 text-emerald-700",
  unpaid: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
};
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

// Icons
const SearchIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const PlusIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const XIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const TrashIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>;
const EyeIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const BanIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;

// Board colors (lib/boardTones.js, monday.com style): a solid status cell.
const STATUS_STYLE = {
  pending:    { bg: "bg-[#579bfc]", text: "text-white" },
  in_transit: { bg: "bg-[#fdab3d]", text: "text-white" },
  delivered:  { bg: "bg-[#00c875]", text: "text-white" },
  cancelled:  { bg: "bg-[#c4c4c4]", text: "text-white" },
};

// Ice products delivered to customers. These are NOT inventory items
// (ice is perishable and goes straight to the truck), so they are a fixed
// list, the same three types used by Customer Prices and Salesman confirmation.
const PRODUCT_TYPES = [
  { value: "bags",       label: "Bags (5kg)" },
  { value: "small_sack", label: "Small Sack (30kg)" },
  { value: "big_sack",   label: "Big Sack (50kg)" },
];
const productLabel = (type) => PRODUCT_TYPES.find((p) => p.value === type)?.label || type;

const EMPTY_ITEM = { product_type: "", quantity_ordered: "" };
// Today as YYYY-MM-DD in the browser's local time (toISOString would be UTC).
const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// One delivery block in the New Delivery form. A function, not a constant, so
// the default date is today even if the page stays open past midnight.
let blockSeq = 0;
const emptyBlock = () => ({
  key: `${Date.now()}-${++blockSeq}`, error: "", // unique after a restored draft too
  driver_id: "", customer_id: "", scheduled_date: todayStr(), notes: "",
  items: [{ ...EMPTY_ITEM }],
});

// Driver status from the backend (App\Support\DriverAvailability): available,
// in_transit or unavailable. Worked out from attendance and deliveries.
const DRIVER_STATUS = {
  available:   { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  in_transit:  { dot: "bg-amber-500",   pill: "bg-amber-50 text-amber-700 border-amber-200" },
  unavailable: { dot: "bg-slate-400",   pill: "bg-slate-100 text-slate-600 border-slate-200" },
};
const DRIVER_ORDER = { available: 0, in_transit: 1, unavailable: 2 };
function statusLabel(d) {
  if (d.status === "available") return "Available";
  if (d.status === "in_transit") return "In-Transit";
  return `Unavailable (${(d.reason || "not timed in yet").toLowerCase()})`;
}

function token() { return localStorage.getItem("token") || ""; }
function authHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` };
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [availability, setAvailability] = useState({ today: "", drivers: [] });
  const [availLoading, setAvailLoading] = useState(false);
  const [customers, setCustomers]   = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [customerFilter, setCustomerFilter] = useState(""); // customer id, "" = all

  // New Delivery modal: kept as a draft while open, so a refresh reopens it as it was.
  const formDraft = useDraft("deliveries:new", { showForm: false, blocks: null }, { when: (v) => v.showForm });
  const { showForm } = formDraft.values;
  const blocks = formDraft.values.blocks || [];
  const { showForm: setShowForm, blocks: setBlocks } = formDraft.set;
  const [saving, setSaving]         = useState(false);

  const [viewing, setViewing]       = useState(null);
  // Salesman proofs (photo, quantities, receipt) keyed by delivery id, shown
  // in the same table, so there is no separate Delivery Proofs page.
  const [proofs, setProofs]         = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = STATUS_FILTERS.some((f) => f.value === searchParams.get("status")) ? searchParams.get("status") : "all";
  const setStatusFilter = (value) => setSearchParams(value === "all" ? {} : { status: value }, { replace: true });
  const [cancelTarget, setCancelTarget] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dRes, cRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/deliveries`, { headers: authHeaders() }),
        fetch(`${API_BASE}/customers`, { headers: authHeaders() }),
        fetch(`${API_BASE}/delivery-proofs`, { headers: authHeaders() }),
      ]);
      if (!dRes.ok) throw new Error(`Deliveries request failed (${dRes.status})`);

      const [dData, cData, pData] = await Promise.all([
        dRes.json(), cRes.json(), pRes.ok ? pRes.json() : [],
      ]);
      const byDelivery = {};
      toList(pData).forEach((p) => { if (p.delivery_id && !byDelivery[p.delivery_id]) byDelivery[p.delivery_id] = p; });
      setProofs(byDelivery);

      setDeliveries(Array.isArray(dData) ? dData : []);
      setCustomers(Array.isArray(cData) ? cData : []);
    } catch (err) {
      setError("Couldn't load deliveries. Check that the backend is running.");
      console.error("fetchAll error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => { fetchAll(); }, [fetchAll, live]);

  // Driver statuses for the picker; reloaded whenever the picker opens, so a
  // Driver who just timed in at the kiosk shows up as Available.
  const fetchAvailability = useCallback(async () => {
    setAvailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/deliveries/driver-availability`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Driver status request failed (${res.status})`);
      const data = await res.json();
      setAvailability({ today: data.today || "", drivers: Array.isArray(data.drivers) ? data.drivers : [] });
    } catch (err) {
      console.error("driver availability error:", err);
    } finally {
      setAvailLoading(false);
    }
  }, []);
  useEffect(() => { if (showForm) fetchAvailability(); }, [showForm, fetchAvailability, live]);

  function openAddForm() {
    setBlocks([emptyBlock()]);
    setShowForm(true);
  }

  function updateBlock(bi, patch) {
    setBlocks((bs) => bs.map((b, i) => (i === bi ? { ...b, ...patch, error: "" } : b)));
  }

  function updateItem(bi, index, field, value) {
    setBlocks((bs) => bs.map((b, i) => {
      if (i !== bi) return b;
      const items = [...b.items];
      items[index] = { ...items[index], [field]: value };
      return { ...b, items, error: "" };
    }));
  }

  function addItemRow(bi) {
    setBlocks((bs) => bs.map((b, i) => (i === bi ? { ...b, items: [...b.items, { ...EMPTY_ITEM }] } : b)));
  }

  function removeItemRow(bi, index) {
    setBlocks((bs) => bs.map((b, i) => (i === bi ? { ...b, items: b.items.filter((_, j) => j !== index) } : b)));
  }

  function addBlock() {
    setBlocks((bs) => [...bs, emptyBlock()]);
    toast.success(`Delivery ${blocks.length + 1} was added to the form.`);
  }

  function removeBlock(bi) {
    setBlocks((bs) => bs.filter((_, i) => i !== bi));
    toast.success(`Delivery ${bi + 1} was removed from the form.`);
  }

  // No double booking: a customer with a delivery that is not cancelled on
  // that date (the backend refuses it too), or picked in another block of
  // this form for the same date. Returns a short note, or "".
  function bookedFor(customerId, date, bi) {
    const existing = deliveries.find((d) => String(d.customer_id) === String(customerId)
      && d.status !== "cancelled" && String(d.scheduled_date || "").slice(0, 10) === date);
    if (existing) return `${existing.delivery_no}, ${existing.status.replace("_", " ")}`;
    const other = blocks.findIndex((b, i) => i !== bi && String(b.customer_id) === String(customerId) && b.scheduled_date === date);
    return other >= 0 ? `Delivery ${other + 1} in this form` : "";
  }

  // Why this block cannot be sent yet, or "".
  function blockProblem(b, bi) {
    if (!b.driver_id) return "Please select a driver.";
    const enforced = !availability.today || b.scheduled_date <= availability.today;
    const drv = availability.drivers.find((d) => String(d.id) === String(b.driver_id));
    if (enforced && drv && drv.status !== "available") return `${drv.name} is ${statusLabel(drv).toLowerCase()}. Pick an available driver.`;
    if (!b.customer_id) return "Please select a customer.";
    if (!b.scheduled_date || b.scheduled_date < todayStr()) return "Scheduled date cannot be in the past.";
    const booked = bookedFor(b.customer_id, b.scheduled_date, bi);
    if (booked) return `This customer already has a delivery on this date (${booked}).`;
    if (b.items.some((it) => !it.product_type || !(Number(it.quantity_ordered) >= 1))) return "Pick a product and a quantity of at least 1 for every item.";
    const types = b.items.map((it) => it.product_type);
    if (new Set(types).size !== types.length) return "Each product can only be added once. Combine the quantities in one row.";
    return "";
  }

  async function submitForm(e) {
    e.preventDefault();

    const checked = blocks.map((b, bi) => ({ ...b, error: blockProblem(b, bi) }));
    if (checked.some((b) => b.error)) {
      setBlocks(checked);
      return;
    }

    setSaving(true);
    const failed = [];
    let created = 0;
    // One request per delivery, in order; the ones that fail stay in the form
    // with the reason, the ones that were saved are taken out.
    for (const b of blocks) {
      // Unit prices are not sent: the backend takes them from Customer Prices
      // for the selected customer, the same prices the Salesman invoice uses.
      const payload = {
        driver_id: b.driver_id,
        customer_id: b.customer_id,
        delivery_type: "outbound",
        scheduled_date: b.scheduled_date,
        notes: b.notes || null,
        items: b.items.map((it) => ({
          product_type: it.product_type,
          quantity_ordered: Number(it.quantity_ordered),
        })),
      };
      try {
        const res = await fetch(`${API_BASE}/deliveries`, {
          method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Failed to create delivery.");
        }
        created++;
      } catch (err) {
        failed.push({ ...b, error: err.message });
      }
    }
    setSaving(false);

    if (created > 0) toast.success(created === 1 ? "Delivery was added." : `${created} deliveries were added.`);
    if (failed.length) {
      toast.error(failed.length === 1 ? "1 delivery was not added. See the form." : `${failed.length} deliveries were not added. See the form.`);
      setBlocks(failed);
    } else {
      setShowForm(false);
    }
    fetchAll();
    fetchAvailability();
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      const res = await fetch(`${API_BASE}/deliveries/${cancelTarget.id}/cancel`, {
        method: "PUT", headers: authHeaders(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Failed to cancel delivery.");
      toast.success(`Delivery ${cancelTarget.delivery_no || ""} was cancelled.`.replace("  ", " "));
      setCancelTarget(null);
      fetchAll();
    } catch (err) {
      toast.error(err.message);
      setCancelTarget(null);
    }
  }

  // Customer filter: the customers that have deliveries (a removed customer's
  // old deliveries still show under their name). The status counts follow it.
  const customerOptions = [...new Map(
    deliveries.filter((d) => d.customer_id).map((d) => [String(d.customer_id), d.customer?.name || `Customer #${d.customer_id}`])
  )].sort((a, b) => a[1].localeCompare(b[1]));
  const forCustomer = customerFilter ? deliveries.filter((d) => String(d.customer_id) === customerFilter) : deliveries;

  const counts = STATUS_FILTERS.reduce((acc, f) => {
    acc[f.value] = f.value === "all" ? forCustomer.length : forCustomer.filter((d) => d.status === f.value).length;
    return acc;
  }, {});
  const filtered = forCustomer.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const proof = proofs[d.id];
    const haystack = `${d.delivery_no} ${d.customer?.name ?? ""} ${d.driver?.name ?? ""} ${proof?.salesman?.name ?? ""} ${proof?.receipt?.receipt_no ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });

  return (
    <AdminLayout pageTitle="Deliveries" breadcrumb="Delivery / Deliveries">
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Deliveries</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Assign a driver, customer and items. The Driver starts the trip; the Salesman confirms it with a photo proof, which creates the receipt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              aria-label="Filter by customer"
              className="bg-slate-50 border border-black/[0.09] rounded-lg px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:border-cyan-500 max-w-[220px]"
            >
              <option value="">All customers</option>
              {customerOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 bg-slate-50 border border-black/[0.09] rounded-lg px-3 py-1.5">
              <SearchIcon />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search delivery, customer, salesman, invoice..."
                className="bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-56"
              />
            </div>
            <button
              onClick={openAddForm}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium rounded-lg transition-colors"
            >
              <PlusIcon /> New Delivery
            </button>
          </div>
        </div>

        <div className="px-[18px] pt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${statusFilter === f.value ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-600 hover:bg-slate-50"}`}
            >
              {f.label}{" "}
              <span className={`ml-1 inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[11px] font-bold tabular-nums ${statusFilter === f.value ? "bg-white text-cyan-700" : counts[f.value] > 0 ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-600"}`}>
                {counts[f.value]}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-[18px] mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
                <th className="px-[18px] py-2.5 font-medium">Delivery No.</th>
                <th className="px-[18px] py-2.5 font-medium">Customer</th>
                <th className="px-[18px] py-2.5 font-medium">Driver</th>
                <th className="px-[18px] py-2.5 font-medium">Scheduled</th>
                <th className="px-[18px] py-2.5 font-medium">Status</th>
                <th className="px-[18px] py-2.5 font-medium">Proof</th>
                <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <SkeletonTableRows cols={7} />
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-[18px] py-8 text-center text-slate-400 text-[13px]">
                  {search || customerFilter || statusFilter !== "all" ? "No deliveries match this filter." : "No deliveries yet."}
                </td></tr>
              )}
              {!loading && filtered.map((d) => {
                const style = STATUS_STYLE[d.status] || STATUS_STYLE.pending;
                const proof = proofs[d.id];
                return (
                  <tr key={d.id} className="border-t border-black/[0.06]">
                    <td className="px-[18px] py-2.5 font-mono text-slate-700">{d.delivery_no}</td>
                    <td className="px-[18px] py-2.5 text-slate-700">{d.customer?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-[18px] py-2.5 text-slate-700">{d.driver?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-[18px] py-2.5 text-slate-600">
                      {d.scheduled_date ? new Date(d.scheduled_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-[18px] py-2.5">
                      <span className={`inline-flex items-center justify-center min-w-[88px] px-2 py-1 rounded-sm text-[11px] font-semibold capitalize ${style.bg} ${style.text}`}>
                        {d.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-[18px] py-2.5">
                      {proof ? (
                        <button type="button" onClick={() => setViewing(d)} className="flex items-center gap-2 cursor-pointer" title="View proof">
                          {photoUrl(proof.photo_path) ? (
                            <img src={photoUrl(proof.photo_path)} alt={`Proof for ${d.delivery_no}`} className="h-9 w-9 rounded-md border border-black/[0.09] object-cover" />
                          ) : (
                            <span className="text-[11px] text-slate-400">No photo</span>
                          )}
                          <span className="text-[11px] font-mono text-slate-500">{proof.receipt?.receipt_no || ""}</span>
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-[18px] py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => setViewing(d)} className="p-1.5 rounded-md border border-black/[0.09] text-slate-500 hover:bg-slate-50" title="View">
                          <EyeIcon />
                        </button>
                        {d.status !== "delivered" && d.status !== "cancelled" && (
                          <button onClick={() => setCancelTarget(d)} className="p-1.5 rounded-md border border-black/[0.09] text-red-500 hover:bg-red-50" title="Cancel">
                            <BanIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Delivery modal: one or more delivery blocks, each with its own
          driver, customer, date and items. "+ Add item" and "+ New delivery"
          sit right under the blocks. */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-black/[0.09] w-full max-w-2xl max-h-[88vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-[14px] font-semibold text-slate-800">
                New Delivery{blocks.length > 1 ? ` (${blocks.length})` : ""}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <XIcon />
              </button>
            </div>
            <form onSubmit={submitForm} className="p-5 flex flex-col gap-4" noValidate>
              <DraftHint draft={formDraft} />
              {blocks.map((block, bi) => {
                const enforced = !availability.today || block.scheduled_date <= availability.today;
                const picked = availability.drivers.find((d) => String(d.id) === String(block.driver_id));
                const pickedBlocked = enforced && picked && picked.status !== "available";
                return (
                  <div key={block.key} className="rounded-xl border border-black/[0.12] bg-white">
                    <div className="px-4 py-2.5 border-b border-black/[0.09] bg-slate-50 rounded-t-xl flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-slate-700">Delivery {bi + 1}</span>
                      {blocks.length > 1 && (
                        <button type="button" onClick={() => removeBlock(bi)} className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 font-medium">
                          <TrashIcon /> Remove
                        </button>
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-3">
                      {block.error && (
                        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{block.error}</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Driver *</label>
                          <DriverPicker
                            drivers={availability.drivers}
                            loading={availLoading}
                            enforced={enforced}
                            value={block.driver_id}
                            onOpen={fetchAvailability}
                            onChange={(id) => updateBlock(bi, { driver_id: id })}
                          />
                          {pickedBlocked && (
                            <p className="text-[11px] text-red-600 mt-1">{picked.name} is {statusLabel(picked).toLowerCase()} and cannot take a delivery today.</p>
                          )}
                          {!enforced && (
                            <p className="text-[11px] text-slate-400 mt-1">Status is for today. Any driver can take a delivery on a later day.</p>
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Customer *</label>
                          <select
                            value={block.customer_id}
                            onChange={(e) => updateBlock(bi, { customer_id: e.target.value })}
                            className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
                          >
                            <option value="">Select customer…</option>
                            {customers.map((c) => {
                              const booked = bookedFor(c.id, block.scheduled_date, bi);
                              return (
                                <option key={c.id} value={c.id} disabled={!!booked}>
                                  {c.name}{c.branch_code ? ` · ${c.branch_code}` : ""}{booked ? ` — already booked (${booked})` : ""}
                                </option>
                              );
                            })}
                          </select>
                          <p className="text-[11px] text-slate-400 mt-1">Customers with a delivery on this date are greyed out.</p>
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Scheduled Date *</label>
                          <input
                            type="date"
                            min={todayStr()}
                            value={block.scheduled_date}
                            onChange={(e) => updateBlock(bi, { scheduled_date: e.target.value })}
                            className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Notes</label>
                          <input
                            type="text"
                            value={block.notes}
                            onChange={(e) => updateBlock(bi, { notes: e.target.value })}
                            className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-500 mb-2 block">Items *</label>
                        <div className="flex flex-col gap-2">
                          {block.items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                              <select
                                value={item.product_type}
                                onChange={(e) => updateItem(bi, idx, "product_type", e.target.value)}
                                aria-label={`Product ${idx + 1}`}
                                className="bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
                              >
                                <option value="">Select product…</option>
                                {PRODUCT_TYPES.map((p) => (
                                  <option key={p.value} value={p.value} disabled={block.items.some((o, j) => j !== idx && o.product_type === p.value)}>{p.label}</option>
                                ))}
                              </select>
                              <input
                                type="number" min="1" placeholder="Qty"
                                aria-label={`Quantity ${idx + 1}`}
                                value={item.quantity_ordered}
                                onChange={(e) => updateItem(bi, idx, "quantity_ordered", e.target.value)}
                                className="bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeItemRow(bi, idx)}
                                disabled={block.items.length === 1}
                                aria-label="Remove item"
                                className="p-1.5 rounded-md border border-black/[0.09] text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => addItemRow(bi)}
                          disabled={block.items.length >= PRODUCT_TYPES.length}
                          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-cyan-500 bg-cyan-50 text-cyan-700 text-[12px] font-semibold hover:bg-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <PlusIcon /> Add item
                        </button>
                        <p className="text-[11px] text-slate-400 mt-2">
                          Unit prices are taken from Customer Prices for the selected customer.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addBlock}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-cyan-500/60 text-cyan-700 hover:bg-cyan-500/[0.06] text-[13px] font-semibold"
              >
                <PlusIcon /> New delivery
              </button>

              <div className="flex justify-end gap-2 mt-1 pt-3 border-t border-black/[0.09]">
                <button type="button" onClick={() => setShowForm(false)} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50">
                  {saving ? "Creating…" : blocks.length > 1 ? `Create ${blocks.length} Deliveries` : "Create Delivery"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View delivery modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-xl border border-black/[0.09] w-full ${proofs[viewing.id] ? "max-w-3xl" : "max-w-lg"} max-h-[85vh] overflow-y-auto`}>
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-800">{viewing.delivery_no}</h3>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600">
                <XIcon />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 text-[13px]">
              <Row label="Customer" value={viewing.customer?.name} />
              <Row label="Driver" value={viewing.driver?.name} />
              <Row label="Scheduled" value={viewing.scheduled_date ? new Date(viewing.scheduled_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
              <Row label="Status" value={<span className="capitalize">{viewing.status?.replace("_", " ")}</span>} />
              <Row label="Notes" value={viewing.notes || "—"} />
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1.5">Items</div>
                <div className="flex flex-col gap-1.5">
                  {(viewing.items || []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between bg-slate-50 border border-black/[0.09] rounded-md px-3 py-2">
                      <span className="text-slate-700">{it.product_type ? productLabel(it.product_type) : it.product?.name}</span>
                      <span className="text-slate-500 font-mono">{it.quantity_ordered} × ₱{Number(it.unit_price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {proofs[viewing.id] && <ProofSection proof={proofs[viewing.id]} />}
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-black/[0.09] w-full max-w-sm p-5">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1.5">Cancel delivery?</h3>
            <p className="text-[12px] text-slate-500 mb-4">
              <span className="font-medium text-slate-700">{cancelTarget.delivery_no}</span> will be marked cancelled and removed from the driver's active list.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelTarget(null)} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px]">
                Keep it
              </button>
              <button onClick={confirmCancel} className="px-3.5 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium">
                Cancel Delivery
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}
// The Salesman's confirmation for a delivered stop: photo, who confirmed it
// and when, and the receipt that was created from it.
function ProofSection({ proof }) {
  const receipt = proof.receipt;
  return (
    <div className="border-t border-black/[0.09] pt-4 mt-1 flex flex-col gap-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">Proof of delivery</div>
      <div className="grid gap-4 md:grid-cols-2">
        {photoUrl(proof.photo_path) ? (
          <a href={photoUrl(proof.photo_path)} target="_blank" rel="noreferrer">
            <img src={photoUrl(proof.photo_path)} alt="Delivery proof" className="w-full rounded-lg border border-black/[0.09] object-cover" />
          </a>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-black/[0.15] text-[12px] text-slate-400">No photo on file</div>
        )}
        <div className="flex flex-col gap-2.5">
          <Row label="Confirmed by" value={proof.salesman?.name || "—"} />
          <Row label="Confirmed" value={formatDateTime(proof.confirmed_at)} />
          <Row label="Qty delivered" value={proof.quantity} />
          {proof.notes && <Row label="Notes" value={proof.notes} />}
        </div>
      </div>
      {receipt && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-slate-700">Invoice <span className="font-mono">{receipt.receipt_no}</span></span>
            {receipt.payment_status && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${PAYMENT_BADGE[receipt.payment_status] || "bg-slate-100 text-slate-600"}`}>{receipt.payment_status}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {(receipt.items || []).map((it) => (
              <div key={it.id} className="flex items-center justify-between bg-slate-50 border border-black/[0.09] rounded-md px-3 py-2">
                <span className="text-slate-700">{productLabel(it.product_type)} × {it.quantity}</span>
                <span className="text-slate-600 font-mono">{peso(it.line_total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 pt-1 font-semibold text-slate-800">
              <span>Total</span>
              <span className="font-mono">{peso(receipt.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Searchable driver dropdown: type a name or employee ID. Every Driver is
// listed with a status (Available, In-Transit, Unavailable); for a delivery
// today only an Available one can be picked. The backend checks the same.
function DriverPicker({ drivers, loading, enforced, value, onChange, onOpen }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = drivers.find((d) => String(d.id) === String(value));
  const needle = q.trim().toLowerCase();
  const list = drivers
    .filter((d) => !needle || `${d.name} ${d.employee_id || ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (DRIVER_ORDER[a.status] ?? 3) - (DRIVER_ORDER[b.status] ?? 3) || a.name.localeCompare(b.name));
  const selectable = (d) => !enforced || d.status === "available";

  function toggle() {
    if (!open) {
      setQ("");
      setActive(0);
      onOpen?.();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    setOpen(!open);
  }

  function pick(d) {
    if (!selectable(d)) return;
    onChange(String(d.id));
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, list.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      const d = list[active] && selectable(list[active]) ? list[active] : list.find(selectable);
      if (d) pick(d);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] text-left outline-none focus:border-cyan-500"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DRIVER_STATUS[selected.status]?.dot}`} />
            <span className="truncate text-slate-800">{selected.name}</span>
            {selected.employee_id && <span className="text-[11px] font-mono text-slate-400">{selected.employee_id}</span>}
          </span>
        ) : (
          <span className="text-slate-400">Select driver…</span>
        )}
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400 flex-shrink-0"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[280px] bg-white border border-black/[0.12] rounded-lg shadow-lg">
          <div className="p-2 border-b border-black/[0.07]">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search name or employee ID…"
              aria-label="Search drivers"
              className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {loading && drivers.length === 0 && <li className="px-3 py-2 text-[12px] text-slate-400">Loading drivers…</li>}
            {!loading && list.length === 0 && <li className="px-3 py-2 text-[12px] text-slate-400">No driver matches.</li>}
            {list.map((d, i) => {
              const ok = selectable(d);
              const st = DRIVER_STATUS[d.status] || DRIVER_STATUS.unavailable;
              return (
                <li
                  key={d.id}
                  role="option"
                  aria-selected={String(d.id) === String(value)}
                  aria-disabled={!ok}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(d)}
                  className={`px-3 py-2 flex items-center justify-between gap-2 text-[13px] ${ok ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${i === active && ok ? "bg-cyan-50" : ""}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{d.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {d.employee_id || "No employee ID"}{d.status === "in_transit" && d.reason ? ` · ${d.reason}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${st.pill}`}>{statusLabel(d)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
