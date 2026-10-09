import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import CameraCapture from "../../components/CameraCapture";
import { ScopeStatusRow } from "../../components/NightMode";

// Icons
const ArrowLeftIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);
const MapPinIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const UserIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const CameraIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PRODUCTS = [
  { key: "bags",       label: "Bags",       sub: "5kg" },
  { key: "small_sack", label: "Small Sack", sub: "30kg" },
  { key: "big_sack",   label: "Big Sack",   sub: "50kg" },
];

const MAX_QTY = 500;

const token = () => localStorage.getItem("token") || "";
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SalesmanDeliveryConfirmation() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [prices, setPrices] = useState({ bags: null, small_sack: null, big_sack: null });

  const [quantities, setQuantities] = useState({ bags: "", small_sack: "", big_sack: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [step, setStep] = useState("form"); // 'form' | 'review' | 'success'
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch("/api/my-deliveries", {
          headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
        });
        if (!res.ok) throw new Error("Failed to load delivery.");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        const found = list.find((d) => String(d.id) === String(id));

        if (!found || found.status === "delivered") {
          setLoadError("This delivery could not be found, or it has already been confirmed.");
          setLoading(false);
          return;
        }
        setDelivery(found);

        const customerId = found.customer?.id;
        if (customerId) {
          const priceRes = await fetch(`/api/customer-prices/${customerId}/lookup`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
          });
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            setPrices(priceData.prices || {});
          }
        }
      } catch (err) {
        setLoadError(err.message || "Could not load this delivery.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Whole numbers only, 500 at most per product (the server checks the same)
  const handleQtyChange = (key, value) => {
    const digits = String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (digits === "") { setQuantities((q) => ({ ...q, [key]: "" })); return; }
    setQuantities((q) => ({ ...q, [key]: String(Math.min(Number(digits), MAX_QTY)) }));
  };

  const activeLines = PRODUCTS
    .filter((p) => Number(quantities[p.key]) > 0)
    .map((p) => {
      const qty = Number(quantities[p.key]);
      const unitPrice = prices[p.key];
      const hasPrice = unitPrice !== null && unitPrice !== undefined;
      return {
        ...p,
        qty,
        unitPrice,
        hasPrice,
        lineTotal: hasPrice ? qty * Number(unitPrice) : null,
      };
    });

  const grandTotal = activeLines.reduce((sum, l) => sum + (l.lineTotal || 0), 0);
  const missingPriceLines = activeLines.filter((l) => !l.hasPrice);

  const canProceedToReview =
    activeLines.length > 0 && missingPriceLines.length === 0 && !!photoFile;

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("delivery_id", delivery.id);
      activeLines.forEach((line, i) => {
        formData.append(`products[${i}][product_type]`, line.key);
        formData.append(`products[${i}][quantity]`, line.qty);
      });
      formData.append("photo", photoFile);

      const res = await fetch("/api/delivery-confirmation", {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
        body: formData,
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.message || "Delivery confirmation failed.");
      }

      toast.success("Delivery confirmed. The receipt was created.");
      setSuccessResult(result);
      setStep("success");
    } catch (err) {
      setSubmitError(err.message || "Request failed. Try again.");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  };

  const storeName = delivery?.customer?.name || delivery?.store_name || "Store";
  const storeAddress = delivery?.customer?.address || delivery?.address || "—";
  // Real delivery number (DEL-0007), not one built from the database id
  const orderCode = delivery ? delivery.delivery_no || `#${delivery.id}` : "";
  // The driver has not started it yet: nothing can be entered or sent
  const notStarted = delivery?.status === "pending";

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/salesman/deliveries")} className="text-slate-400 cursor-pointer" aria-label="Back to deliveries">
            <ArrowLeftIcon />
          </button>
          <div className="text-[14px] font-semibold text-slate-800 leading-none">Confirm Delivery</div>
          </div>
        <ScopeStatusRow />
      </header>
        <div className="flex-1 w-full px-5 py-5" aria-busy="true" aria-label="Loading the delivery">
          <SkeletonList />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 gap-4">
        <div className="text-[13px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
          {loadError}
        </div>
        <button
          onClick={() => navigate("/salesman/deliveries")}
          className="px-5 py-2.5 bg-cyan-500 active:bg-cyan-600 text-white text-[12px] font-semibold rounded-xl cursor-pointer"
        >
          Back to Deliveries
        </button>
      </div>
    );
  }

  // ── Success state ──
  if (step === "success" && successResult) {
    const receipt = successResult.receipt || {};
    const items = receipt.items || [];

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="brand-logo w-11 h-11 flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
          </div>
          <span className="text-[13px] font-semibold text-slate-800">Delivery Confirmed</span>
          </div>
        <ScopeStatusRow />
      </header>

        <div className="flex-1 px-5 py-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center text-green-500">
              <CheckIcon />
            </div>
            <div className="text-[14px] font-semibold text-slate-800">Confirmed & Sent to Admin</div>
            <div className="text-[12px] text-slate-400 text-center">
              Sale recorded automatically. This copy is saved to your account.
            </div>
          </div>

          <div className="border border-black/[0.08] rounded-2xl overflow-hidden bg-white">
            <div className="bg-slate-50 border-b border-black/[0.08] px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase tracking-widest">Receipt</span>
              <span className="text-[12px] font-mono font-semibold text-slate-800">
                {receipt.receipt_no || "—"}
              </span>
            </div>

            <div className="px-4 py-3.5 flex flex-col gap-2.5 border-b border-black/[0.06]">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-400">Store</span>
                <span className="text-slate-700 font-medium text-right">{storeName}</span>
              </div>
              <div className="flex items-start justify-between text-[12px]">
                <span className="text-slate-400">Address</span>
                <span className="text-slate-700 font-medium text-right max-w-[65%]">{storeAddress}</span>
              </div>
            </div>

            <div className="px-4 py-3.5 flex flex-col gap-2.5 border-b border-black/[0.06]">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Products</span>
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-600 capitalize">
                    {it.product_type.replace("_", " ")} × {it.quantity}
                  </span>
                  <span className="text-slate-700 font-mono">{peso(it.line_total)}</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500 font-medium">Total Amount</span>
                <span className="text-slate-800 font-mono font-semibold">{peso(receipt.total_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Payment Status</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium capitalize">
                  {receipt.payment_status || "unpaid"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate("/salesman/deliveries")}
            className="w-full py-3.5 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl cursor-pointer mt-2"
          >
            Back to Deliveries
          </button>
        </div>
      </div>
    );
  }

  // ── Review step ──
  if (step === "review") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("form")} className="text-slate-400 cursor-pointer">
            <ArrowLeftIcon />
          </button>
          <span className="text-[14px] font-semibold text-slate-800">Review & Confirm</span>
          </div>
        <ScopeStatusRow />
      </header>

        <div className="flex-1 px-5 py-5 flex flex-col gap-4 overflow-y-auto">
          <div className="text-[12px] text-slate-400">
            Please review before sending to Admin. This cannot be edited after submission.
          </div>

          <div className="border border-black/[0.08] rounded-2xl bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-black/[0.06] flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">Store</span>
              <span className="text-[13px] font-medium text-slate-800">{storeName}</span>
              <span className="text-[11px] text-slate-400">{storeAddress}</span>
            </div>

            <div className="px-4 py-3 flex flex-col gap-2 border-b border-black/[0.06]">
              {activeLines.map((l) => (
                <div key={l.key} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-600">{l.label} ({l.sub}) × {l.qty}</span>
                  <span className="text-slate-800 font-mono">{peso(l.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-500">Total</span>
              <span className="text-[15px] font-mono font-semibold text-slate-800">{peso(grandTotal)}</span>
            </div>
          </div>

          {photoPreview && (
            <img src={photoPreview} alt="Proof" className="w-full h-40 object-cover rounded-xl border border-black/[0.08]" />
          )}

          {submitError && (
            <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          <div className="flex flex-col gap-2.5 mt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-sm"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                "Send to Admin"
              )}
            </button>
            <button
              onClick={() => navigate("/salesman/deliveries")}
              disabled={submitting}
              className="w-full py-3 text-slate-400 text-[12px] font-medium cursor-pointer"
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form step (default) ──
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4">
        <div className="flex items-center gap-3">
        <button onClick={() => navigate("/salesman/deliveries")} className="text-slate-400 cursor-pointer">
          <ArrowLeftIcon />
        </button>
        <div>
          <div className="text-[14px] font-semibold text-slate-800 leading-none">Confirm Delivery</div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">{orderCode}</div>
        </div>
        </div>
        <ScopeStatusRow />
      </header>

      <div className="flex-1 px-5 py-5 flex flex-col gap-4 overflow-y-auto pb-8">

        {notStarted && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            The driver has not started this delivery yet. You can enter the quantities and take the photo once it is In Transit.
          </div>
        )}

        {/* Store info */}
        <div className="border border-black/[0.08] rounded-2xl bg-white px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
            <UserIcon />{storeName}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <MapPinIcon />{storeAddress}
          </div>
        </div>

        {/* Product rows */}
        <div className="flex flex-col gap-2.5">
          <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5">
            Products Delivered
          </label>

          {PRODUCTS.map((p) => {
            const unitPrice = prices[p.key];
            const hasPrice = unitPrice !== null && unitPrice !== undefined;
            const qty = quantities[p.key];

            return (
              <div key={p.key} className="border border-black/[0.08] rounded-xl bg-white px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">{p.label}</div>
                  <div className="text-[10px] text-slate-400">{p.sub}</div>
                  {hasPrice ? (
                    <div className="text-[10px] text-cyan-600 font-mono mt-0.5">{peso(unitPrice)} / unit</div>
                  ) : (
                    <div className="text-[10px] text-red-400 mt-0.5">No price set for this customer</div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => handleQtyChange(p.key, e.target.value)}
                    placeholder="0"
                    aria-label={`${p.label} quantity, up to ${MAX_QTY}`}
                    disabled={!hasPrice || notStarted}
                    className="w-24 px-3 py-2.5 border border-black/[0.12] rounded-lg bg-slate-50/80 text-[15px] font-mono text-slate-800 text-center outline-none focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <span className={`text-[10px] ${Number(qty) >= MAX_QTY ? "text-amber-600 font-medium" : "text-slate-400"}`}>max {MAX_QTY}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Grand total */}
        {activeLines.length > 0 && (
          <div className="border border-black/[0.08] rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] font-medium text-slate-500">Total</span>
            <span className="text-[15px] font-mono font-semibold text-slate-800">{peso(grandTotal)}</span>
          </div>
        )}

        {missingPriceLines.length > 0 && (
          <div className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {missingPriceLines.map((l) => l.label).join(", ")} — no price set for this customer. Remove the quantity or ask Admin to set pricing first.
          </div>
        )}

        {/* Payment status (fixed) */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-medium text-slate-500 tracking-widest uppercase">Payment Status</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[11px] font-medium">Unpaid</span>
        </div>

        {/* Photo proof: taken with the camera here, never uploaded */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium text-slate-500 tracking-widest uppercase px-0.5 flex items-center gap-1.5">
            <CameraIcon /> Photo Proof
          </label>
          <CameraCapture
            stamp={orderCode}
            disabled={notStarted}
            onCapture={(file, url) => { setPhotoFile(file); setPhotoPreview(url); }}
          />
        </div>

        <button
          onClick={() => setStep("review")}
          disabled={!canProceedToReview || notStarted}
          className="w-full py-3.5 bg-cyan-500 active:bg-cyan-600 text-white text-[13px] font-semibold rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-2 shadow-sm"
        >
          Review & Continue
        </button>
      </div>
    </div>
  );
}