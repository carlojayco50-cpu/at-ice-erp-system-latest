import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import { ScopeStatusRow } from "../../components/NightMode";

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const statusStyle = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-slate-50 text-slate-400 border-black/[0.09]",
};

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CheckerStockMovementsPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("stock_in");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actingOn, setActingOn] = useState(null); // id currently being confirmed/cancelled

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stock-movements", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load stock movements.");
      const data = await res.json();
      setMovements(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : data.data || []);
    } catch {
      /* non-fatal — form will just show an empty product list */
    }
  }, [token]);

  // Load on open
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["inventory"]);
  useEffect(() => {
    fetchMovements();
    fetchProducts();
  }, [fetchMovements, fetchProducts, live]);

  async function submitMovement(e) {
    e.preventDefault();
    if (!productId || !quantity) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/stock-movements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: productId,
          type,
          quantity: Number(quantity),
          reason: notes || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not log the movement."));
      toast.success(type === "stock_in" ? "Stock in was logged." : "Stock movement was logged.");
      setProductId("");
      setType("stock_in");
      setQuantity("");
      setNotes("");
      setShowForm(false);
      fetchMovements();
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function act(id, action) {
    setActingOn(id);
    setError("");
    try {
      const res = await fetch(`/api/stock-movements/${id}/${action}`, {
        method: "PUT",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, `Could not ${action} this movement.`));
      fetchMovements();
      fetchProducts(); // stock levels change after a confirm
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
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
              Stock In / Stock Out
            </div>
            <div className="text-[12px] text-slate-400 leading-tight">
              Double-entry: a second Checker confirms each movement
            </div>
          </div>
        </div>
        <ScopeStatusRow className="px-4 pb-3" />

        <div className="px-4 pb-3 flex">
          <button
            onClick={() => setShowForm((s) => !s)}
            className={`flex items-center gap-1 text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors ${
              showForm ? "border border-black/[0.09] text-slate-600" : "bg-cyan-500 hover:bg-cyan-600 text-white"
            }`}
          >
            {showForm ? "Close form" : (<><PlusIcon /> New Movement</>)}
          </button>
        </div>

        {showForm && (
          <form onSubmit={submitMovement} className="px-4 pb-4 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3">
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
            >
              <option value="">{products.length ? "Select item" : "No items yet. Add one in Inventory Management."}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.current_stock ?? 0} {p.unit || "on hand"})
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              {["stock_in", "stock_out"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)} aria-pressed={type === t}
                  className={`flex-1 text-[13px] font-medium py-2 rounded-lg border transition-colors ${
                    type === t
                      ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                      : "border-black/[0.09] text-slate-500"
                  }`}
                >
                  {t === "stock_in" ? "Stock In" : "Stock Out"}
                </button>
              ))}
            </div>

            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantity"
              required
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
            />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400 resize-none"
            />

            <button
              type="submit"
              disabled={submitting}
              className="text-[13px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg py-2 transition-colors disabled:opacity-50"
            >
              {submitting ? "Logging…" : "Log movement"}
            </button>
          </form>
        )}
      </div>

      <div className="w-full px-4 py-4 flex flex-col gap-2.5 max-w-2xl mx-auto">
        {error && <div className="text-[13px] text-red-500 text-center py-2">{error}</div>}
        {loading && <SkeletonList />}
        {!loading && movements.length === 0 && (
          <EmptyState icon="box">No stock movements logged yet.</EmptyState>
        )}

        {!loading &&
          movements.map((m) => (
            <div key={m.id} className="rounded-xl border border-black/[0.09] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-slate-800 truncate">
                    {m.product?.name || "Unknown product"}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    {m.type === "stock_in" ? "Stock In" : "Stock Out"} · logged by{" "}
                    {m.entered_by?.name || "—"} · {fmtDate(m.created_at)}
                  </div>
                  {(m.reason || m.notes) && <div className="text-[12px] text-slate-500 mt-1">{m.reason || m.notes}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[16px] font-semibold font-mono text-slate-800">
                    {m.type === "stock_out" ? "−" : "+"}
                    {m.quantity}
                  </div>
                  <span
                    className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusStyle[m.status] || statusStyle.pending}`}
                  >
                    {m.status}
                  </span>
                </div>
              </div>

              {m.status === "pending" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-black/[0.06]">
                  <button
                    onClick={() => act(m.id, "confirm")}
                    disabled={actingOn === m.id}
                    className="flex-1 text-[13px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg py-1.5 transition-colors disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => act(m.id, "cancel")}
                    disabled={actingOn === m.id}
                    className="flex-1 text-[13px] font-medium border border-black/[0.09] text-slate-500 hover:text-slate-800 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {m.status === "confirmed" && m.confirmed_by && (
                <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-black/[0.06]">
                  Confirmed by {m.confirmed_by.name}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}