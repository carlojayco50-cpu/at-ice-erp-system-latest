import { useEffect, useState, useCallback } from "react";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, BottomSheet, ActionBar, Stepper, ErrorBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, FIELD, TEXTAREA, LABEL } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import { formatDateTime } from "../../lib/time";

const STATUS_LABEL = { pending: "To confirm", confirmed: "Confirmed", cancelled: "Cancelled" };

function firstError(data, fallback) {
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data?.message || fallback;
}

// Checker > Stock: stock in / stock out with double entry. One Checker logs a
// movement and a second Checker confirms it (or cancels it).
export default function CheckerStockMovementsPage() {
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [formError, setFormError] = useState("");

  const draft = useDraft("checker:movement", { showForm: false, productId: "", type: "stock_in", quantity: "", notes: "" }, { when: (v) => v.showForm });
  const { showForm, productId, type, quantity, notes } = draft.values;
  const { showForm: setShowForm, productId: setProductId, type: setType, quantity: setQuantity, notes: setNotes } = draft.set;
  const [submitting, setSubmitting] = useState(false);
  const [actingOn, setActingOn] = useState(null); // `${id}:${action}`
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const h = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const [m, p] = await Promise.all([fetch("/api/stock-movements", { headers: h }), fetch("/api/products", { headers: h })]);
      if (!m.ok) throw new Error("Failed to load stock movements.");
      const md = await m.json();
      setMovements(Array.isArray(md) ? md : md.data || []);
      if (p.ok) {
        const pd = await p.json();
        setProducts(Array.isArray(pd) ? pd : pd.data || []);
      }
      setStatus("ready");
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
      setStatus("error");
    }
  }, [token]);
  const live = useLiveTick(["inventory"]);
  useEffect(() => { load(); }, [load, live]);

  async function submitMovement(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (timedIn === false) return setFormError("Time in at the Attendance Station first.");
    if (!productId) return setFormError("Choose the item.");
    if (!(Number(quantity) >= 1)) return setFormError("Enter a quantity of at least 1.");
    const item = products.find((p) => String(p.id) === String(productId));
    if (type === "stock_out" && item && Number(quantity) > Number(item.current_stock)) {
      return setFormError(`Only ${item.current_stock} ${item.unit || ""} on hand.`.trim());
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: productId, type, quantity: Number(quantity), reason: notes || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, "Could not log the movement."));
      toast.success(type === "stock_in" ? "Stock in was logged. A second Checker confirms it." : "Stock out was logged. A second Checker confirms it.");
      draft.clear();
      setFilter("pending");
      load();
    } catch (e) {
      setFormError(e.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function act(m, action) {
    if (actingOn) return;
    setActingOn(`${m.id}:${action}`);
    setError("");
    try {
      const res = await fetch(`/api/stock-movements/${m.id}/${action}`, { method: "PUT", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(firstError(data, `Could not ${action} this movement.`));
      // the card changes at once
      setMovements((list) => list.map((x) => (x.id === m.id ? { ...x, status: action === "confirm" ? "confirmed" : "cancelled" } : x)));
      toast.success(action === "confirm" ? "Movement was confirmed." : "Movement was cancelled.");
      setCancelTarget(null);
      load();
    } catch (e) {
      toast.error(e.message || "Request failed. Try again.");
    } finally {
      setActingOn(null);
    }
  }

  const visible = filter === "pending" ? movements.filter((m) => m.status === "pending") : movements;
  const pendingCount = movements.filter((m) => m.status === "pending").length;

  return (
    <RoleShell
      role="checker"
      title="Stock in / out"
      actionBar={<ActionBar><LoadingButton onClick={() => setShowForm(true)} disabled={timedIn === false}><Icon name="plus" /> Log a movement</LoadingButton></ActionBar>}
    >
      <TimeInNotice timedIn={timedIn} />

      <div className="flex gap-2" role="tablist" aria-label="Show">
        {[["pending", `To confirm ${pendingCount}`], ["all", `All ${movements.length}`]].map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={`min-h-[44px] px-4 rounded-full border text-[14px] font-semibold active:scale-[0.98] transition-transform ${filter === v ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}
      {status === "ready" && visible.length === 0 && (
        <EmptyCard icon="swap" title={filter === "pending" ? "Nothing to confirm" : "No movements yet"}>
          {filter === "pending" ? "Every logged movement is confirmed." : "Tap Log a movement to record stock in or out."}
        </EmptyCard>
      )}

      {status === "ready" && (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((m) => (
            <article key={m.id} className={`${CARD} ${m.status === "confirmed" ? "border-emerald-200" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-slate-900 truncate">{m.product?.name || "Unknown item"}</h2>
                  <div className="text-[13px] text-slate-500">{m.type === "stock_in" ? "Stock in" : "Stock out"} · by {m.entered_by?.name || "—"} · {formatDateTime(m.created_at, { year: false })}</div>
                  {(m.reason || m.notes) && <p className="text-[14px] text-slate-600 mt-1">{m.reason || m.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xl font-bold tabular-nums ${m.type === "stock_out" ? "text-rose-700" : "text-emerald-700"}`}>{m.type === "stock_out" ? "−" : "+"}{m.quantity}</div>
                  <StatusBadge status={m.status} className="mt-1">{STATUS_LABEL[m.status] || m.status}</StatusBadge>
                </div>
              </div>
              {m.status === "pending" && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <LoadingButton loading={actingOn === `${m.id}:confirm`} disabled={!!actingOn || timedIn === false} onClick={() => act(m, "confirm")}>
                    <Icon name="check" /> Confirm
                  </LoadingButton>
                  <LoadingButton data-no-confirm variant="secondary" disabled={!!actingOn || timedIn === false} onClick={() => setCancelTarget(m)}>Cancel</LoadingButton>
                </div>
              )}
              {m.status === "confirmed" && m.confirmed_by && <div className="text-[13px] text-emerald-700 mt-2">Confirmed by {m.confirmed_by.name}</div>}
            </article>
          ))}
        </div>
      )}

      <BottomSheet
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        title="Log a movement"
        footer={<LoadingButton type="submit" form="movement-form" loading={submitting} disabled={timedIn === false}>{submitting ? "Logging…" : "Log movement"}</LoadingButton>}
      >
        <form id="movement-form" onSubmit={submitMovement} className="space-y-4" noValidate>
          <DraftHint draft={draft} />
          <ErrorBanner>{formError}</ErrorBanner>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
            {[["stock_in", "Stock in"], ["stock_out", "Stock out"]].map(([t, label]) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
                className={`min-h-[44px] rounded-xl border text-[15px] font-semibold active:scale-[0.98] transition-transform ${type === t ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white text-slate-600"}`}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="mv-item" className={LABEL}>Item *</label>
            <select id="mv-item" value={productId} onChange={(e) => setProductId(e.target.value)} className={FIELD}>
              <option value="">{products.length ? "Choose an item…" : "No items yet. Add one in Inventory."}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.current_stock ?? 0} {p.unit || "on hand"})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mv-qty" className={LABEL}>Quantity *</label>
            <Stepper id="mv-qty" label="Quantity" min={0} value={quantity} onChange={setQuantity} />
          </div>
          <div>
            <label htmlFor="mv-notes" className={LABEL}>Notes</label>
            <textarea id="mv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivered by supplier, DR no. 1234" className={TEXTAREA} />
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={!!cancelTarget}
        onClose={() => !actingOn && setCancelTarget(null)}
        title="Cancel this movement?"
        footer={<>
          <LoadingButton variant="danger" loading={!!cancelTarget && actingOn === `${cancelTarget.id}:cancel`} onClick={() => act(cancelTarget, "cancel")}>Cancel movement</LoadingButton>
          <LoadingButton variant="secondary" disabled={!!actingOn} onClick={() => setCancelTarget(null)}>Keep it</LoadingButton>
        </>}
      >
        {cancelTarget && (
          <p className="text-[15px] text-slate-600">
            {cancelTarget.type === "stock_in" ? "Stock in" : "Stock out"} of <b>{cancelTarget.quantity}</b> {cancelTarget.product?.name} will not change the stock.
          </p>
        )}
      </BottomSheet>
    </RoleShell>
  );
}
