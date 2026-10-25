// src/pages/customer/CustomerDeliveryProofs.jsx
// Gallery of photo proofs for the customer's own deliveries
// (GET /api/my-delivery-proofs).

import { useEffect, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";
import EmptyState from "../../components/EmptyState";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { formatDateShort } from "../../lib/time";

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fmtDateTime = (v) => {
  if (!v) return "Not set";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return formatDateTime(d);
};

// Photos are stored on Laravel's "public" disk (delivery_proofs/xxx.jpg),
// so they are served from the backend at /storage/... (needs
// `php artisan storage:link`). Same approach as the Admin Delivery Proofs page.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const photoUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BACKEND_URL}/storage/${String(path).replace(/^\/+/, "")}`;
};

export default function CustomerDeliveryProofs() {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [broken, setBroken] = useState({});

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/my-delivery-proofs", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Could not load delivery proofs (${res.status})`);
        setProofs(toList(await res.json()));
      } catch (err) {
        setError(err.message || "Could not load your delivery proofs.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live]);

  const markBroken = (id) => setBroken((b) => ({ ...b, [id]: true }));

  const Photo = ({ proof, className }) =>
    broken[proof.id] || !proof.photo_path ? (
      <div className={`bg-slate-100 flex items-center justify-center text-[11px] text-slate-400 ${className}`}>
        Photo not available
      </div>
    ) : (
      <img
        src={photoUrl(proof.photo_path)}
        alt={`Proof for ${proof.delivery?.delivery_no || "delivery"}`}
        onError={() => markBroken(proof.id)}
        className={`object-cover ${className}`}
      />
    );

  return (
    <CustomerLayout pageTitle="Delivery Proofs" breadcrumb="Deliveries">
      {loading ? (
        <SkeletonList card />
      ) : error ? (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-md p-6 text-sm text-red-600">{error}</div>
      ) : proofs.length === 0 ? (
        <div className="bg-white border border-black/[0.09] rounded-xl">
          <EmptyState icon="truck" title="No delivery proofs yet">A photo appears here after each delivery is confirmed by our Salesman.</EmptyState>
        </div>
      ) : (
        <>
        {(() => {
          const month = new Date().toLocaleDateString("en-CA").slice(0, 7); // local YYYY-MM
          const whenOf = (p) => p.confirmed_at || p.created_at;
          const thisMonth = proofs.filter((p) => whenOf(p) && new Date(whenOf(p)).toLocaleDateString("en-CA").slice(0, 7) === month).length;
          const qty = proofs.reduce((s, p) => s + Number(p.quantity || 0), 0);
          const latest = [...proofs].sort((a, b) => new Date(whenOf(b)) - new Date(whenOf(a)))[0];
          return (
            <KpiGrid cols={4}>
              <KpiCard label="Delivery proofs" icon="file" tone="cyan" value={proofs.length} sub="Photos from our Salesman" />
              <KpiCard label="This month" icon="calendar" tone="emerald" value={thisMonth} sub="Deliveries confirmed" bar={proofs.length ? thisMonth / proofs.length : 0} />
              <KpiCard label="Units received" icon="box" tone="violet" value={qty} sub="Bags and sacks in all" />
              <KpiCard label="Latest delivery" icon="truck" tone="slate" value={latest ? formatDateShort(whenOf(latest)) : "—"} sub={latest?.delivery?.delivery_no || ""} />
            </KpiGrid>
          );
        })()}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {proofs.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="text-left bg-white border border-black/[0.09] rounded-xl overflow-hidden hover:border-cyan-500/40 transition-colors"
            >
              <Photo proof={p} className="w-full h-44" />
              <div className="px-4 py-3">
                <div className="text-xs font-medium text-slate-800">{p.delivery?.delivery_no || "Delivery"}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {p.quantity} item{Number(p.quantity) === 1 ? "" : "s"} confirmed
                </div>
                <div className="text-[11px] text-slate-400">{fmtDateTime(p.confirmed_at)}</div>
              </div>
            </button>
          ))}
        </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-xl border border-black/[0.09] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">{selected.delivery?.delivery_no || "Delivery"}</div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-2">
                &times;
              </button>
            </div>
            <Photo proof={selected} className="w-full max-h-[60vh] min-h-[10rem]" />
            <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <div className="text-slate-400">Quantity confirmed</div>
                <div className="text-slate-800 mt-0.5">{selected.quantity}</div>
              </div>
              <div>
                <div className="text-slate-400">Confirmed on</div>
                <div className="text-slate-800 mt-0.5">{fmtDateTime(selected.confirmed_at)}</div>
              </div>
              <div>
                <div className="text-slate-400">Confirmed by</div>
                <div className="text-slate-800 mt-0.5">{selected.salesman?.name || "Not recorded"}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}