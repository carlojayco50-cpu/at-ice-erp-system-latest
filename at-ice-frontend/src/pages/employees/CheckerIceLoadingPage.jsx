import { useState, useEffect, useMemo, useCallback } from "react";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, BottomSheet, Stepper, ErrorBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, CARD_BUTTON, FIELD, LABEL } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import { formatDateTime } from "../../lib/time";

const token = () => localStorage.getItem("token") || "";
const PRODUCT_TYPES = [
  { key: "bags", label: "Bags", sub: "5kg" },
  { key: "small_sack", label: "Small Sack", sub: "30kg" },
  { key: "big_sack", label: "Big Sack", sub: "50kg" },
];
const PRODUCT_LABELS = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };
const EMPTY_QTY = { bags: "", small_sack: "", big_sack: "" };

// Now as a datetime-local value in the phone's time.
function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Checker > Loading: today's deliveries as a checklist. Tap one that is not
// counted yet, count the sacks per type with the big - / + buttons (they
// start from what Admin booked), and save. Each delivery is counted once.
export default function CheckerIceLoadingPage() {
  const [loadings, setLoadings] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const timedIn = useTimedIn();

  // The count is kept as a draft while open, so a refresh keeps it.
  const draft = useDraft("checker:ice-loading", {
    showForm: false, deliveryId: "", loadedAt: "", quantities: EMPTY_QTY,
  }, { when: (v) => v.showForm });
  const { showForm, deliveryId, loadedAt, quantities } = draft.values;
  const { showForm: setShowForm, deliveryId: setDeliveryId, loadedAt: setLoadedAt, quantities: setQuantities } = draft.set;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const h = { Accept: "application/json", Authorization: `Bearer ${token()}` };
      const [l, d] = await Promise.all([fetch("/api/ice-loadings", { headers: h }), fetch("/api/ice-loadings/deliveries", { headers: h })]);
      if (!l.ok || !d.ok) throw new Error("Could not load the deliveries and counts.");
      const [ld, dd] = await Promise.all([l.json(), d.json()]);
      setLoadings(Array.isArray(ld) ? ld : ld.data || []);
      setDeliveries(Array.isArray(dd) ? dd : []);
      setStatus("ready");
    } catch (err) {
      setLoadError(err.message);
      setStatus("error");
    }
  }, []);
  const live = useLiveTick(["deliveries"]);
  useEffect(() => { load(); }, [load, live]);

  const chosen = deliveries.find((d) => String(d.id) === String(deliveryId));
  const total = useMemo(() => PRODUCT_TYPES.reduce((s, p) => s + (Number(quantities[p.key]) || 0), 0), [quantities]);

  function openCount(d) {
    if (d.loaded) return;
    setDeliveryId(String(d.id));
    setLoadedAt(nowLocal());
    setQuantities(Object.fromEntries(PRODUCT_TYPES.map((p) => [p.key, d.booked?.[p.key] != null ? String(d.booked[p.key]) : ""])));
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (timedIn === false) return setFormError("Time in at the Attendance Station first. Saving is turned off until your Time In is recorded.");
    if (!deliveryId || !loadedAt) return setFormError("Choose the delivery and the loaded-at time.");
    if (chosen?.loaded) return setFormError(`This delivery was already counted${chosen.loaded_by ? ` by ${chosen.loaded_by}` : ""}.`);
    if (total <= 0) return setFormError("Enter at least one quantity greater than zero.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/ice-loadings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          delivery_id: Number(deliveryId),
          loaded_at: loadedAt,
          items: PRODUCT_TYPES.map((p) => ({ product_type: p.key, quantity: Number(quantities[p.key]) || 0 })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.already_loaded) toast.error("Already counted by the other Checker.");
        setFormError(data.message || "Failed to record the count. Please try again.");
        load();
        return;
      }
      // the checklist turns to Counted at once
      setDeliveries((list) => list.map((d) => (String(d.id) === String(deliveryId) ? { ...d, loaded: true, loaded_by: "you" } : d)));
      toast.success("Ice loading was recorded.");
      draft.clear();
      load();
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // One card per delivery + time, newest first.
  const history = useMemo(() => {
    const map = new Map();
    for (const rec of loadings) {
      const key = `${rec.delivery_id}__${rec.loaded_at}`;
      if (!map.has(key)) map.set(key, { key, delivery: rec.delivery, delivery_id: rec.delivery_id, loaded_at: rec.loaded_at, checker: rec.checker?.name, items: [], total: 0 });
      const g = map.get(key);
      g.items.push(rec);
      g.total += rec.quantity_loaded;
    }
    return [...map.values()].sort((a, b) => new Date(b.loaded_at) - new Date(a.loaded_at)).slice(0, 20);
  }, [loadings]);

  const toCount = deliveries.filter((d) => !d.loaded).length;

  return (
    <RoleShell role="checker" title="Ice loading">
      <TimeInNotice timedIn={timedIn} />

      {status === "loading" && <CardSkeleton rows={4} />}
      {status === "error" && <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>}

      {status === "ready" && (
        <>
          <section aria-label="Deliveries to count" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-900">Today's trucks</h2>
              <StatusBadge tone={toCount ? "pending" : "done"}>{toCount ? `${toCount} to count` : "All counted"}</StatusBadge>
            </div>
            {deliveries.length === 0 ? (
              <EmptyCard icon="truck" title="No trucks to count">No pending or in-transit deliveries today.</EmptyCard>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {deliveries.map((d) => (
                  <button key={d.id} type="button" onClick={() => openCount(d)} disabled={d.loaded}
                    aria-label={`${d.delivery_no} ${d.customer || ""}${d.loaded ? ", counted" : ", tap to count"}`}
                    className={`${CARD_BUTTON} flex items-center gap-3 ${d.loaded ? "!opacity-100 border-emerald-200 bg-emerald-50/40" : ""}`}>
                    <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${d.loaded ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      <Icon name={d.loaded ? "check" : "truck"} size={20} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-slate-900 truncate">{d.customer || "Delivery"}</span>
                      <span className="block text-[13px] text-slate-500 truncate">
                        {d.delivery_no}{d.driver ? ` · ${d.driver}` : ""}{d.loaded && d.loaded_by ? ` · counted by ${d.loaded_by}` : ""}
                      </span>
                    </span>
                    <StatusBadge tone={d.loaded ? "done" : "pending"}>{d.loaded ? "Counted" : "To count"}</StatusBadge>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Recorded counts" className="space-y-3">
            <h2 className="text-[15px] font-semibold text-slate-900">Recorded counts</h2>
            {history.length === 0 ? (
              <EmptyCard icon="clipboard" title="No counts yet">Counts you save show here.</EmptyCard>
            ) : history.map((g) => (
              <article key={g.key} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-slate-900 truncate">{g.delivery?.customer?.name || g.delivery?.delivery_no || `Delivery #${g.delivery_id}`}</h3>
                    <div className="text-[13px] text-slate-500">{g.delivery?.delivery_no || `#${g.delivery_id}`}</div>
                  </div>
                  <StatusBadge tone="done">{g.total} sacks</StatusBadge>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {g.items.filter((i) => i.quantity_loaded > 0).map((i) => (
                    <span key={i.id} className="text-[13px] text-slate-600 bg-slate-100 rounded-full px-2.5 py-0.5">{i.quantity_loaded} {PRODUCT_LABELS[i.product_type] || i.product_type}</span>
                  ))}
                </div>
                <div className="text-[12px] text-slate-400 mt-2">{formatDateTime(g.loaded_at, { year: false })}{g.checker ? ` · ${g.checker}` : ""}</div>
              </article>
            ))}
          </section>
        </>
      )}

      <BottomSheet
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        title={chosen ? `Count ${chosen.customer || chosen.delivery_no}` : "Count sacks"}
        footer={
          <LoadingButton type="submit" form="ice-count-form" loading={submitting} disabled={timedIn === false || !!chosen?.loaded}>
            {submitting ? "Saving…" : `Save count · ${total} sacks`}
          </LoadingButton>
        }
      >
        <form id="ice-count-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DraftHint draft={draft} onDiscard={() => setFormError("")} />
          <ErrorBanner>{formError}</ErrorBanner>
          {chosen && <div className="text-[14px] text-slate-500">{chosen.delivery_no}{chosen.driver ? ` · Driver ${chosen.driver}` : ""}</div>}
          {PRODUCT_TYPES.map((p) => (
            <div key={p.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor={`qty-${p.key}`} className="text-[15px] font-semibold text-slate-800">{p.label} <span className="text-[13px] font-normal text-slate-400">{p.sub}</span></label>
                {chosen?.booked?.[p.key] != null && <span className="text-[13px] text-slate-400">booked {chosen.booked[p.key]}</span>}
              </div>
              <Stepper id={`qty-${p.key}`} label={p.label} value={quantities[p.key]} onChange={(v) => setQuantities((q) => ({ ...q, [p.key]: v }))} />
            </div>
          ))}
          <div>
            <label htmlFor="ice-loaded-at" className={LABEL}>Loaded at</label>
            <input id="ice-loaded-at" type="datetime-local" value={loadedAt} onChange={(e) => setLoadedAt(e.target.value)} className={FIELD} />
          </div>
        </form>
      </BottomSheet>
    </RoleShell>
  );
}
