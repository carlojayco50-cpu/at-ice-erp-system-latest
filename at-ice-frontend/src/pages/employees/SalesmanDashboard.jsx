import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, ActionBar, ErrorBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD } from "../../lib/mobileUi";
import { useLiveTick } from "../../lib/live";
import { printDeliveryConfirmation } from "../../lib/printDelivery";
import { formatDateTime } from "../../lib/time";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";

const token = () => localStorage.getItem("token") || "";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const PRODUCT_LABEL = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };
const STATUS_LABEL = { pending: "Waiting for driver", in_transit: "On route", delivered: "Delivered", cancelled: "Cancelled" };
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Salesman > Deliveries. "To deliver" (?view unset): today's stops; tap one to
// select it and confirm it from the bar at the bottom once the Driver has
// started it. "Delivered" (?view=delivered): what this Salesman confirmed,
// with the invoice and proof photo.
export default function SalesmanDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const delivered = params.get("view") === "delivered";
  const [deliveries, setDeliveries] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const timedIn = useTimedIn();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/my-deliveries", { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to load deliveries.");
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : data.data || []);
      setStatus("ready");
    } catch (err) {
      setLoadError(err.message || "Could not load deliveries.");
      setStatus("error");
    }
  }, []);
  const live = useLiveTick(["deliveries"]);
  useEffect(() => { load(); }, [load, live]);

  const open = deliveries.filter((d) => d.status === "pending" || d.status === "in_transit")
    .sort((a, b) => (a.status === "in_transit" ? -1 : 1) - (b.status === "in_transit" ? -1 : 1));
  const done = deliveries.filter((d) => d.status === "delivered");
  const visible = delivered ? done : open;
  const selected = visible.find((d) => d.id === selectedId) || null;

  const sacks = (d) => (d.items || []).reduce((s, i) => s + Number(i.quantity_ordered || 0), 0);
  const summary = delivered
    ? [["Delivered", done.length, "done"], ["Sacks", done.reduce((s, d) => s + sacks(d), 0), "done"]]
    : [["On route", open.filter((d) => d.status === "in_transit").length, "progress"], ["Waiting for driver", open.filter((d) => d.status === "pending").length, "pending"]];

  const actionBar = selected ? (
    <ActionBar>
      {selected.status === "in_transit" && (
        <LoadingButton disabled={timedIn === false} onClick={() => navigate(`/salesman/deliveries/${selected.id}/confirm`)}><Icon name="camera" /> Confirm delivery · {selected.customer?.name || "store"}</LoadingButton>
      )}
      {selected.status === "pending" && <LoadingButton disabled>Waiting for the driver to start</LoadingButton>}
      {selected.status === "delivered" && <PrintButton delivery={selected} />}
    </ActionBar>
  ) : null;

  return (
    <RoleShell role="salesman" title={delivered ? "Delivered" : "To deliver"} actionBar={actionBar}>
      <TimeInNotice timedIn={timedIn} />
      <div className="grid grid-cols-1 gap-3">
        {summary.map(([label, value, tone]) => (
          <div key={label} className={`${CARD} flex items-center justify-between`}>
            <StatusBadge tone={tone}>{label}</StatusBadge>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>}
      {status === "ready" && visible.length === 0 && (
        <EmptyCard icon="truck" title={delivered ? "Nothing delivered yet" : "No stops right now"}>
          {delivered ? "Deliveries you confirm show here." : "Deliveries for today show here when Admin books them."}
        </EmptyCard>
      )}

      {status === "ready" && (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((d) => {
            const isSel = selectedId === d.id;
            return (
              <article key={d.id} data-selected={isSel || undefined} className={`${CARD} !p-0 overflow-hidden`}>
                <button type="button" onClick={() => setSelectedId(isSel ? null : d.id)} aria-expanded={isSel}
                  className="w-full text-left p-4 active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-slate-900 truncate">{d.customer?.name || d.store_name || "Store"}</h2>
                      <div className="text-[13px] text-slate-500 truncate flex items-center gap-1"><Icon name="pin" size={14} className="flex-shrink-0" />{d.customer?.address || d.address || "—"}</div>
                    </div>
                    <StatusBadge status={d.status}>{STATUS_LABEL[d.status] || d.status}</StatusBadge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(d.items || []).map((i) => (
                      <div key={i.id} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-center">
                        <div className="text-[17px] font-bold tabular-nums text-slate-900">{i.quantity_ordered}</div>
                        <div className="text-[11px] text-slate-500 leading-tight">{PRODUCT_LABEL[i.product_type] || i.product_type}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-2">{d.delivery_no}{d.driver?.name ? ` · Driver ${d.driver.name}` : ""}</div>
                </button>
                {isSel && d.status === "delivered" && <div className="px-4 pb-4"><SubmittedProof delivery={d} /></div>}
              </article>
            );
          })}
        </div>
      )}
    </RoleShell>
  );
}

function PrintButton({ delivery }) {
  const proof = (delivery.proofs || [])[0];
  return (
    <LoadingButton variant="secondary" onClick={() => printDeliveryConfirmation({
      delivery, proof, receipt: proof?.receipt,
      photoUrl: proof?.photo_path ? `${BACKEND_URL}/storage/${proof.photo_path}` : null,
    })}>
      <Icon name="print" /> Print delivery confirmation
    </LoadingButton>
  );
}

// What this Salesman submitted for a delivered stop: invoice and proof photo.
function SubmittedProof({ delivery }) {
  const proof = (delivery.proofs || [])[0];
  const receipt = proof?.receipt;
  const when = proof?.confirmed_at || delivery.delivered_at;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[14px] text-emerald-700">
        Confirmed{when ? ` on ${formatDateTime(when, { year: false })}` : ""}. Sent to Admin.
      </div>
      {receipt && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
            <span className="text-[13px] text-slate-500">Invoice</span>
            <span className="text-[14px] font-mono font-semibold text-slate-900">{receipt.receipt_no || "—"}</span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {(receipt.items || []).map((it) => (
              <div key={it.id} className="flex items-center justify-between text-[14px]">
                <span className="text-slate-600">{PRODUCT_LABEL[it.product_type] || it.product_type} × {it.quantity}</span>
                <span className="font-mono text-slate-800">{peso(it.line_total)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[15px] font-semibold border-t border-slate-200 pt-1.5">
              <span>Total</span><span className="font-mono">{peso(receipt.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
      {proof?.photo_path && (
        <a href={`${BACKEND_URL}/storage/${proof.photo_path}`} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200">
          <img src={`${BACKEND_URL}/storage/${proof.photo_path}`} alt="Proof of delivery" className="w-full max-h-48 object-cover" />
        </a>
      )}
    </div>
  );
}
