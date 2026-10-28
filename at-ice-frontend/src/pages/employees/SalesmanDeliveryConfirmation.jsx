import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, ActionBar, Stepper, ErrorBanner, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import CameraCapture from "../../components/CameraCapture";
import { printDeliveryConfirmation } from "../../lib/printDelivery";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useMaxQuantity } from "../../lib/limits";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import { UploadBar } from "../../components/FileDropZone";
import { sendForm } from "../../lib/upload";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const PRODUCTS = [
  { key: "bags", label: "Bags", sub: "5kg" },
  { key: "small_sack", label: "Small Sack", sub: "30kg" },
  { key: "big_sack", label: "Big Sack", sub: "50kg" },
];
const token = () => localStorage.getItem("token") || "";
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Quantities Admin booked on the delivery, by product: { bags: "20", ... }, at most
// the shared per-product limit when `max` is given (the prefill); uncapped without it.
function orderedQuantities(delivery, max = Infinity) {
  const q = { bags: "", small_sack: "", big_sack: "" };
  for (const it of delivery?.items || []) {
    if (!(it.product_type in q)) continue;
    const n = Number(q[it.product_type] || 0) + Number(it.quantity_ordered || 0);
    q[it.product_type] = n > 0 ? String(Math.min(n, max)) : "";
  }
  return q;
}

// Salesman > Confirm delivery: the quantities actually delivered (starting
// from what Admin booked), a photo taken here, a review, then Send to Admin,
// which records the proof and makes the invoice.
export default function SalesmanDeliveryConfirmation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const timedIn = useTimedIn();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [prices, setPrices] = useState({ bags: null, small_sack: null, big_sack: null });

  // Changed quantities survive a refresh (per delivery); the photo is taken again.
  const MAX_QTY = useMaxQuantity(); // same limit as New Delivery and Ice Loading (config/atice.php)
  const maxRef = useRef(MAX_QTY);
  maxRef.current = MAX_QTY;
  const draft = useDraft(`salesman:confirm:${id}`, { dirty: false, quantities: null }, { when: (v) => v.dirty });
  const quantities = draft.values.quantities || { bags: "", small_sack: "", big_sack: "" };
  const setQuantities = draft.set.quantities;
  const editQty = (key, v) => {
    draft.set.dirty(true);
    const digits = String(v).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    setQuantities((q) => ({ ...q, [key]: digits === "" ? "" : String(Math.min(Number(digits), MAX_QTY)) }));
  };
  // The limit may arrive after the prefill: keep every quantity within it
  useEffect(() => {
    setQuantities((q) => {
      if (!q) return q;
      const next = { ...q };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (Number(next[k]) > MAX_QTY) { next[k] = String(MAX_QTY); changed = true; }
      }
      return changed ? next : q;
    });
  }, [MAX_QTY, setQuantities]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [step, setStep] = useState("form"); // form | review | success
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/my-deliveries", { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error("Failed to load the delivery.");
        const data = await res.json();
        const found = (Array.isArray(data) ? data : data.data || []).find((d) => String(d.id) === String(id));
        if (!found || found.status === "delivered") throw new Error("This delivery could not be found, or it has already been confirmed.");
        if (!alive) return;
        setDelivery(found);
        setQuantities((q) => q ?? orderedQuantities(found, maxRef.current));
        if (found.customer?.id) {
          const pr = await fetch(`/api/customer-prices/${found.customer.id}/lookup`, { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
          if (pr.ok && alive) setPrices((await pr.json()).prices || {});
        }
        if (alive) setStatus("ready");
      } catch (err) {
        if (alive) {
          setLoadError(err.message || "Could not load this delivery.");
          setStatus("error");
        }
      }
    })();
    return () => { alive = false; };
  }, [id, setQuantities]);

  const lines = PRODUCTS.filter((p) => Number(quantities[p.key]) > 0).map((p) => {
    const qty = Number(quantities[p.key]);
    const unitPrice = prices[p.key];
    const hasPrice = unitPrice !== null && unitPrice !== undefined;
    return { ...p, qty, unitPrice, hasPrice, lineTotal: hasPrice ? qty * Number(unitPrice) : null };
  });
  const total = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const missingPrice = lines.filter((l) => !l.hasPrice);
  const notStarted = delivery?.status === "pending";
  const ready = lines.length > 0 && missingPrice.length === 0 && !!photoFile && !notStarted && timedIn !== false;
  const storeName = delivery?.customer?.name || delivery?.store_name || "Store";
  const storeAddress = delivery?.customer?.address || delivery?.address || "—";
  const orderCode = delivery ? delivery.delivery_no || `#${delivery.id}` : "";

  async function send() {
    if (submitting) return;
    setSubmitError("");
    setSubmitting(true);
    setUploadPct(0);
    try {
      const fd = new FormData();
      fd.append("delivery_id", delivery.id);
      lines.forEach((l, i) => {
        fd.append(`products[${i}][product_type]`, l.key);
        fd.append(`products[${i}][quantity]`, l.qty);
      });
      fd.append("photo", photoFile);
      const data = await sendForm("/api/delivery-confirmation", fd, { onProgress: setUploadPct });
      toast.success("Delivery confirmed. The invoice was created.");
      draft.clear();
      setResult(data);
      setStep("success");
    } catch (err) {
      setSubmitError(err.message || "Request failed. Try again.");
      setStep("review");
    } finally {
      setSubmitting(false);
    }
  }

  let actionBar = null;
  if (status === "ready" && step === "form") {
    actionBar = <ActionBar><LoadingButton disabled={!ready} onClick={() => setStep("review")}>Review · {peso(total)}</LoadingButton></ActionBar>;
  } else if (step === "review") {
    actionBar = (
      <ActionBar>
        <LoadingButton loading={submitting} disabled={timedIn === false} onClick={send}>{submitting ? "Sending…" : "Send to Admin"}</LoadingButton>
        <LoadingButton variant="secondary" disabled={submitting} onClick={() => setStep("form")}>Edit</LoadingButton>
      </ActionBar>
    );
  } else if (step === "success") {
    actionBar = <ActionBar><LoadingButton onClick={() => navigate("/salesman/deliveries")}>Back to deliveries</LoadingButton></ActionBar>;
  }

  const title = step === "success" ? "Delivery confirmed" : step === "review" ? "Review" : "Confirm delivery";

  return (
    <RoleShell role="salesman" title={title} actionBar={actionBar}>
      {step !== "success" && <TimeInNotice timedIn={timedIn} />}
      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && (
        <>
          <ErrorBanner>{loadError}</ErrorBanner>
          <LoadingButton className="w-full" onClick={() => navigate("/salesman/deliveries")}>Back to deliveries</LoadingButton>
        </>
      )}

      {status === "ready" && (
        <section className={CARD} aria-label="Store">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-900">{storeName}</h2>
              <div className="text-[13px] text-slate-500 flex items-start gap-1"><Icon name="pin" size={14} className="mt-0.5 flex-shrink-0" />{storeAddress}</div>
            </div>
            <span className="text-[13px] font-mono text-slate-400">{orderCode}</span>
          </div>
        </section>
      )}

      {status === "ready" && step === "form" && (
        <>
          <DraftHint draft={draft} onDiscard={() => setQuantities(orderedQuantities(delivery, MAX_QTY))} />
          {notStarted && <ErrorBanner>The driver has not started this delivery yet. You can confirm it once it is On route.</ErrorBanner>}
          {PRODUCTS.map((p) => {
            const unitPrice = prices[p.key];
            const hasPrice = unitPrice !== null && unitPrice !== undefined;
            const ordered = Number(orderedQuantities(delivery)[p.key] || 0); // what Admin booked (not capped)
            const diff = Number(quantities[p.key] || 0) - ordered;
            return (
              <div key={p.key} className={CARD}>
                <div className="flex items-baseline justify-between mb-2">
                  <label htmlFor={`qty-${p.key}`} className="text-[15px] font-semibold text-slate-900">{p.label} <span className="text-[13px] font-normal text-slate-400">{p.sub}</span></label>
                  {hasPrice ? <span className="text-[13px] font-mono text-slate-500">{peso(unitPrice)} each</span> : <StatusBadge tone="urgent">No price</StatusBadge>}
                </div>
                <Stepper id={`qty-${p.key}`} label={p.label} max={MAX_QTY} value={quantities[p.key]} onChange={(v) => editQty(p.key, v)} disabled={!hasPrice || notStarted} />
                {ordered > 0 && (
                  <div className={`text-[13px] mt-2 ${diff === 0 ? "text-slate-500" : "text-amber-700 font-semibold"}`}>
                    Booked by Admin: {ordered}{diff !== 0 && ` · ${diff < 0 ? `${-diff} short` : `${diff} extra`}`}
                  </div>
                )}
              </div>
            );
          })}
          {missingPrice.length > 0 && <ErrorBanner>{missingPrice.map((l) => l.label).join(", ")}: no price set for this customer. Remove the quantity or ask Admin to set the price.</ErrorBanner>}
          <div className={`${CARD} flex items-center justify-between`}>
            <span className="text-[15px] font-semibold text-slate-700">Payment</span>
            <StatusBadge tone="pending">Unpaid</StatusBadge>
          </div>
          <div className="space-y-2">
            <div className="text-[15px] font-semibold text-slate-900 flex items-center gap-1.5"><Icon name="camera" /> Photo proof *</div>
            <div className="min-h-[56px]">
              <CameraCapture stamp={orderCode} disabled={notStarted} onCapture={(file, url) => { setPhotoFile(file); setPhotoPreview(url); }} />
            </div>
          </div>
        </>
      )}

      {status === "ready" && step === "review" && (
        <>
          {submitting && uploadPct !== null && <UploadBar progress={uploadPct} />}
          <ErrorBanner>{submitError}</ErrorBanner>
          <p className="text-[14px] text-slate-500">Check before sending. It cannot be edited after you send it.</p>
          <div className={`${CARD} space-y-2`}>
            {lines.map((l) => (
              <div key={l.key} className="flex items-center justify-between text-[15px]">
                <span className="text-slate-600">{l.label} ({l.sub}) × {l.qty}</span>
                <span className="font-mono text-slate-900">{peso(l.lineTotal)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[17px] font-bold border-t border-slate-200 pt-2">
              <span>Total</span><span className="font-mono">{peso(total)}</span>
            </div>
          </div>
          {photoPreview && <img src={photoPreview} alt="Proof" className="w-full h-48 object-cover rounded-xl border border-slate-200" />}
        </>
      )}

      {step === "success" && result && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Icon name="check" size={22} /></div>
            <div className="text-[16px] font-bold text-emerald-800">Confirmed and sent to Admin</div>
            <div className="text-[14px] text-emerald-700">The invoice was created.</div>
          </div>
          <div className={`${CARD} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-slate-500">Invoice</span>
              <span className="text-[15px] font-mono font-semibold text-slate-900">{result.receipt?.receipt_no || "—"}</span>
            </div>
            {(result.receipt?.items || []).map((it) => (
              <div key={it.id} className="flex items-center justify-between text-[15px]">
                <span className="text-slate-600 capitalize">{it.product_type.replace("_", " ")} × {it.quantity}</span>
                <span className="font-mono">{peso(it.line_total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[17px] font-bold border-t border-slate-200 pt-2">
              <span>Total</span><span className="font-mono">{peso(result.receipt?.total_amount)}</span>
            </div>
            <div className="flex items-center justify-between"><span className="text-[13px] text-slate-500">Payment</span><StatusBadge tone="pending">{result.receipt?.payment_status || "unpaid"}</StatusBadge></div>
          </div>
          <LoadingButton variant="secondary" className="w-full" onClick={() => printDeliveryConfirmation({
            delivery, proof: result.proof, receipt: result.receipt,
            photoUrl: result.proof?.photo_path ? `${BACKEND_URL}/storage/${result.proof.photo_path}` : null,
          })}>
            <Icon name="print" /> Print delivery confirmation
          </LoadingButton>
        </>
      )}
    </RoleShell>
  );
}
