import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, ActionBar, ErrorBanner, EmptyCard, CardSkeleton, Icon, BottomSheet } from "../../components/MobileUi";
import { CARD } from "../../lib/mobileUi";
import { useLiveTick } from "../../lib/live";
import { printDeliveryConfirmation } from "../../lib/printDelivery";
import { formatDateTime } from "../../lib/time";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { StopMeta, ArrivalChips } from "../../components/RouteParts";
import { pressArrived } from "../../lib/route";
import { toast } from "../../lib/toast";
import { KpiIcon } from "../../components/Kpi";
import { TONES } from "../../lib/kpiTones";

const ICON_TONE = { done: "emerald", progress: "cyan", pending: "amber" };

const token = () => localStorage.getItem("token") || "";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const PRODUCT_LABEL = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };
const STATUS_LABEL = { pending: "Waiting for driver", in_transit: "On route", delivered: "Delivered", cancelled: "Cancelled" };
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Salesman > Deliveries (owner, 2026-10-20).
// "To deliver" (?view unset): the route of the Driver this Salesman rides with
// today, the same list the Driver sees, nearest the plant first. The system
// picks a Driver who has timed in; the Salesman may change it to any other
// Driver on shift. A stop is confirmed only after the Driver and the Salesman
// both pressed Arrived at the store (GPS checked by the server).
// "Delivered" (?view=delivered): what this Salesman confirmed, with the
// invoice and proof photo. Both lists show 10 per page.
export default function SalesmanDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const delivered = params.get("view") === "delivered";
  const [route, setRoute] = useState({ crew: null, drivers: [], route: [], radius_m: 150 });
  const [done, setDone] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [arriving, setArriving] = useState(false);
  const timedIn = useTimedIn();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const headers = { Accept: "application/json", Authorization: `Bearer ${token()}` };
      if (delivered) {
        const res = await fetch("/api/my-deliveries", { headers });
        if (!res.ok) throw new Error("Failed to load deliveries.");
        const data = await res.json();
        setDone((Array.isArray(data) ? data : data.data || []).filter((d) => d.status === "delivered"));
      } else {
        const res = await fetch("/api/my-route", { headers });
        if (!res.ok) throw new Error("Failed to load your route.");
        setRoute(await res.json());
      }
      setStatus("ready");
    } catch (err) {
      setLoadError(err.message || "Could not load deliveries.");
      setStatus("error");
    }
  }, [delivered]);
  const live = useLiveTick(["deliveries", "attendance"]);
  useEffect(() => { load(); }, [load, live]);

  const stops = route.route || [];
  const visible = delivered ? done : stops;
  const pager = usePagination(visible, { initialSize: 10 });
  const selected = visible.find((d) => d.id === selectedId) || null;
  const crew = route.crew;

  async function arrive(d) {
    setArriving(true);
    try {
      const res = await pressArrived(`/api/my-route/deliveries/${d.id}/arrive`);
      toast.success(res.message || "Arrived.");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setArriving(false);
    }
  }

  const sacks = (d) => (d.items || []).reduce((sum, i) => sum + Number(i.quantity_ordered || 0), 0);
  const summary = delivered
    ? [["Delivered", done.length, "done", "check"], ["Sacks", done.reduce((sum, d) => sum + sacks(d), 0), "done", "box"]]
    : [["On route", stops.filter((d) => d.status === "in_transit").length, "progress", "truck"], ["Waiting for driver", stops.filter((d) => d.status === "pending").length, "pending", "users"]];

  let actionBar = null;
  if (selected) {
    const arrived = selected.arrival || {};
    actionBar = (
      <ActionBar>
        {selected.status === "pending" && <LoadingButton disabled>Waiting for the driver to start</LoadingButton>}
        {selected.status === "in_transit" && !arrived.salesman && (
          <LoadingButton loading={arriving} disabled={timedIn === false} onClick={() => arrive(selected)} data-no-confirm
            data-tip={`Shares your location. You must be within ${route.radius_m} m of the store.`}>
            <Icon name="pin" /> I am at the store
          </LoadingButton>
        )}
        {selected.status === "in_transit" && arrived.salesman && !arrived.driver && <LoadingButton disabled>Waiting for the driver to arrive</LoadingButton>}
        {selected.status === "in_transit" && arrived.salesman && arrived.driver && (
          <LoadingButton disabled={timedIn === false} onClick={() => navigate(`/salesman/deliveries/${selected.id}/confirm`)}><Icon name="camera" /> Confirm delivery · {selected.customer?.name || "store"}</LoadingButton>
        )}
        {selected.status === "delivered" && <PrintButton delivery={selected} />}
      </ActionBar>
    );
  }

  return (
    <RoleShell role="salesman" title={delivered ? "Delivered" : "To deliver"} actionBar={actionBar}>
      <TimeInNotice timedIn={timedIn} />

      {!delivered && status === "ready" && (
        <section className={`${CARD} flex items-center justify-between gap-3`} aria-label="Your driver today">
          <div className="min-w-0">
            <div className="text-[12px] text-slate-500">You ride with</div>
            {crew?.on_shift ? (
              <>
                <div className="text-[16px] font-semibold text-slate-900 truncate">{crew.driver?.name}</div>
                <div className="text-[12px] text-slate-500 truncate">
                  {[crew.driver?.vehicle_plate, crew.chosen_by === "salesman" ? "Your pick" : "Picked by the system"].filter(Boolean).join(" · ")}
                </div>
              </>
            ) : (
              <div className="text-[14px] font-semibold text-amber-800">No driver has timed in yet</div>
            )}
          </div>
          <LoadingButton variant="secondary" className="!w-auto flex-shrink-0" disabled={timedIn === false || route.drivers.length === 0}
            onClick={() => setPicking(true)} data-no-confirm data-tip="Pick another driver who has timed in today">
            Change
          </LoadingButton>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3">
        {summary.map(([label, value, tone, icon]) => (
          <div key={label} className={`${CARD} flex items-center justify-between`}>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${TONES[ICON_TONE[tone]].badge}`}><KpiIcon name={icon} /></span>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>}
      {status === "ready" && visible.length === 0 && (
        <EmptyCard icon="truck" title={delivered ? "Nothing delivered yet" : "No stops right now"}>
          {delivered ? "Deliveries you confirm show here." : crew?.on_shift ? "Your driver has no stops left today." : "Your route shows once a driver has timed in."}
        </EmptyCard>
      )}

      {status === "ready" && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {pager.pageItems.map((d) => {
            const isSel = selectedId === d.id;
            return (
              <article key={d.id} data-selected={isSel || undefined} className={`${CARD} !p-0 overflow-hidden`}>
                <button type="button" onClick={() => setSelectedId(isSel ? null : d.id)} aria-expanded={isSel}
                  className="w-full text-left p-4 active:scale-[0.98] transition-transform">
                  {!delivered && <StopMeta delivery={d} className="mb-2" />}
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
                  {!delivered && d.status === "in_transit" && <div className="mt-2"><ArrivalChips arrival={d.arrival} salesmanLabel="You" /></div>}
                </button>
                {isSel && d.status === "delivered" && <div className="px-4 pb-4"><SubmittedProof delivery={d} /></div>}
              </article>
            );
          })}
          <div className="rounded-2xl overflow-hidden"><Pagination pager={pager} label={delivered ? "deliveries" : "stops"} fixed /></div>
        </div>
      )}

      <BottomSheet open={picking} onClose={() => setPicking(false)} title="Ride with another driver">
        <p className="text-[14px] text-slate-500">Only drivers who have timed in today are listed. Your route becomes theirs.</p>
        <div className="space-y-2">
          {route.drivers.map((dr) => (
            <DriverOption key={dr.id} driver={dr} current={crew?.driver_id === dr.id} onPicked={() => { setPicking(false); setSelectedId(null); load(); }} />
          ))}
        </div>
      </BottomSheet>
    </RoleShell>
  );
}

// One Driver on shift in the picker: name, truck, stops and Salesmen with them.
function DriverOption({ driver, current, onPicked }) {
  const [busy, setBusy] = useState(false);
  async function pick() {
    setBusy(true);
    try {
      const res = await fetch("/api/my-route/driver", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ driver_id: driver.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not change your driver.");
      toast.success(data.message || "Driver changed.");
      onPicked();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={pick} disabled={busy || current}
      data-confirm={`Your route becomes ${driver.name}'s stops for today.`} data-confirm-title={`Ride with ${driver.name}?`}
      className={`${CARD} w-full text-left flex items-center justify-between gap-3 disabled:opacity-100`}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-slate-900 truncate">{driver.name}</div>
        <div className="text-[12px] text-slate-500 truncate">
          {[driver.vehicle_plate, `${driver.open_stops} open ${driver.open_stops === 1 ? "stop" : "stops"}`, `${driver.salesmen} ${driver.salesmen === 1 ? "salesman" : "salesmen"}`].filter(Boolean).join(" · ")}
        </div>
      </div>
      {current
        ? <StatusBadge tone="done">Current</StatusBadge>
        : <StatusBadge tone={driver.status === "in_transit" ? "progress" : "done"}>{driver.status === "in_transit" ? "On the road" : "Available"}</StatusBadge>}
    </button>
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
