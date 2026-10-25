// src/pages/customer/CustomerDashboard.jsx
//
// Real Dashboard: profile card (from GET /api/my-profile) plus summary
// counts computed client-side from GET /api/my-delivery-history and
// GET /api/my-receipts. No separate backend summary endpoint needed for
// this — the customer's own delivery/receipt lists are small enough that
// counting on the frontend is simpler and one less endpoint to maintain.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../../components/CustomerLayout";
import { COMPANY, ICE_CARD, ICE_INSET } from "../../lib/company";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import { PAYMENT_BADGE, paymentState } from "../../lib/paymentStatus";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { MiniBars, TipsWidget } from "../../components/Insight";

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const peso = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL = {
  pending: "Pending",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BADGE = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  in_transit: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-slate-200 text-slate-500 border-slate-300",
};


const ShieldIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
const PinIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const MailIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>;
const PhoneIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;

function CompanyCard() {
  const navigate = useNavigate();
  return (
    <div className={`${ICE_CARD} p-5 h-full flex flex-col`}>
      <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-800">
        <span className="text-cyan-600"><ShieldIcon /></span> {COMPANY.name}
      </div>
      <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-black/[0.06] text-[12px] text-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-cyan-600"><PinIcon /></span> {COMPANY.shortAddress}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-cyan-600"><MailIcon /></span> Email:
          <a href={`mailto:${COMPANY.email}`} className="font-mono text-cyan-600 truncate">{COMPANY.email}</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-600"><PhoneIcon /></span> Hotline:
          <a href={COMPANY.hotlineHref} className="font-mono text-cyan-600">{COMPANY.hotline}</a>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate("/customer/support")}
        className={`${ICE_INSET} w-full mt-4 py-2.5 text-[13px] font-medium text-slate-700 hover:border-cyan-500/40 hover:text-cyan-600 transition-colors cursor-pointer`}
      >
        Contact Dispatcher
      </button>
    </div>
  );
}

export default function CustomerDashboard() {
  const [profile, setProfile] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries", "receipts", "prices"]);
  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, deliveriesRes, receiptsRes] = await Promise.all([
          fetch("/api/my-profile", { headers: authHeaders() }),
          fetch("/api/my-delivery-history", { headers: authHeaders() }),
          fetch("/api/my-receipts", { headers: authHeaders() }),
        ]);

        if (!profileRes.ok) throw new Error(`Could not load profile (${profileRes.status})`);
        if (!deliveriesRes.ok) throw new Error(`Could not load deliveries (${deliveriesRes.status})`);
        if (!receiptsRes.ok) throw new Error(`Could not load receipts (${receiptsRes.status})`);

        setProfile(await profileRes.json());
        setDeliveries(toList(await deliveriesRes.json()));
        setReceipts(toList(await receiptsRes.json()));
      } catch (err) {
        setError(err.message || "Could not load your dashboard.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live]);

  const pendingCount = deliveries.filter((d) => d.status === "pending").length;
  const inTransitCount = deliveries.filter((d) => d.status === "in_transit").length;
  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;

  const balanceDue = receipts
    .filter((r) => r.payment_status !== "paid")
    .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const overdueCount = receipts.filter((r) => r.payment_status === "overdue").length;

  const recentDeliveries = deliveries.slice(0, 5);
  const recentReceipts = receipts.slice(0, 5);

  if (loading) {
    return (
      <CustomerLayout pageTitle="Dashboard" breadcrumb="Overview">
        <SkeletonList card />
      </CustomerLayout>
    );
  }

  if (error) {
    return (
      <CustomerLayout pageTitle="Dashboard" breadcrumb="Overview">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-600">
          {error}
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout pageTitle="Dashboard" breadcrumb="Overview">
      {/* Left: profile, counts and the two recent lists, stretched to the
          height of the company card on the right, so there is no dead space */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-stretch">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Profile card */}
          <div className={`${ICE_CARD} px-5 py-4`}>
            <div className="text-[15px] font-semibold text-slate-800">{profile?.name}</div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {profile?.address && <span>{profile.address}{profile?.city ? `, ${profile.city}` : ""}{profile?.province ? `, ${profile.province}` : ""}</span>}
              {profile?.contact_person && <span>Contact: {profile.contact_person}</span>}
              {profile?.contact_number && <span>{profile.contact_number}</span>}
            </div>
          </div>

          {/* Summary cards */}
          <KpiGrid cols={4}>
            <KpiCard label="Pending" icon="clock" tone="amber" value={pendingCount} sub="Not yet dispatched" bar={deliveries.length ? pendingCount / deliveries.length : 0} />
            <KpiCard label="In transit" icon="truck" tone="cyan" value={inTransitCount} sub="On the way to you" live={inTransitCount > 0} bar={deliveries.length ? inTransitCount / deliveries.length : 0} />
            <KpiCard label="Delivered" icon="check" tone="emerald" value={deliveredCount} sub={`${deliveries.length} deliveries in all`} bar={deliveries.length ? deliveredCount / deliveries.length : 0} />
            <KpiCard label="Balance due" icon="wallet" tone={overdueCount ? "rose" : "violet"} money value={balanceDue} sub={overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}` : "All current"} />
          </KpiGrid>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
            {/* Recent deliveries */}
            <div className={`${ICE_CARD} overflow-hidden h-full flex flex-col`}>
              <div className="px-5 py-3.5 border-b border-black/[0.06] text-[13px] font-semibold text-slate-800">
                Recent Deliveries
              </div>
              {recentDeliveries.length === 0 ? (
                <EmptyState icon="truck" compact>No deliveries yet.</EmptyState>
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {recentDeliveries.map((d) => (
                    <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-slate-800">{d.delivery_no}</div>
                        <div className="text-[11px] text-slate-400">{d.driver_name || "Driver not yet assigned"}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_BADGE[d.status] || ""}`}>
                        {STATUS_LABEL[d.status] || d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent receipts */}
            <div className={`${ICE_CARD} overflow-hidden h-full flex flex-col`}>
              <div className="px-5 py-3.5 border-b border-black/[0.06] text-[13px] font-semibold text-slate-800">
                Recent Receipts
              </div>
              {recentReceipts.length === 0 ? (
                <EmptyState icon="receipt" compact>No invoices yet.</EmptyState>
              ) : (
                <div className="divide-y divide-black/[0.06]">
                  {recentReceipts.map((r) => (
                    <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-slate-800">{r.receipt_no}</div>
                        <div className="text-[11px] text-slate-400">{peso(r.total_amount)}</div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${PAYMENT_BADGE[paymentState(r)].cls}`}>
                        {PAYMENT_BADGE[paymentState(r)].label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <CompanyCard />
          <MiniBars title="Deliveries, last 6 months" data={[...Array(6)].map((_, i) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - (5 - i));
            const monthOf = (v) => { const t = new Date(v); return `${t.getFullYear()}-${t.getMonth()}`; };
            const key = monthOf(d);
            return { label: d.toLocaleDateString("en-PH", { month: "short" }), value: deliveries.filter((x) => (x.scheduled_date || x.created_at) && monthOf(x.scheduled_date || x.created_at) === key).length };
          })} />
          <TipsWidget tips={[
            { title: "Paid already?", text: "Send a photo of your bank or GCash receipt from Invoices; we mark it paid once checked.", tone: "cyan", icon: "receipt" },
            { title: "Delivery proof", text: "Every delivery has a photo proof from our Salesman under Delivery Proofs.", tone: "emerald", icon: "file" },
            { title: "Need help?", text: "Use Contact Support or call the dispatcher hotline.", tone: "violet", icon: "message" },
          ]} />
        </div>
      </div>

    </CustomerLayout>
  );
}