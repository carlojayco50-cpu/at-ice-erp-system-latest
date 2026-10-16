import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Chart } from "chart.js/auto";
import echo from "../../echo";
import AdminLayout from "../../components/AdminLayout";
import EmptyState from "../../components/EmptyState";
import { useLiveTick } from "../../lib/live";
import { BoardGroup, BoardRow, StatusCell } from "../../components/Board";
import { formatTime } from "../../lib/time";

const DollarIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const AlertIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const TruckIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const ArrowUp    = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>;
const ArrowDown  = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 9 12 15 6 9"/></svg>;
const RefreshIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;

// HELPERS
const fmt  = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const token = () => localStorage.getItem("token") || "";
// "07:58:00" -> "7:58 AM"
const clock = (t) => formatTime(t);

// AI summary time: "2:45 PM" today, "Oct 15, 2:45 PM" on another day
const updatedAt = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = formatTime(d);
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${time}`;
};

// Chart axis: ₱0, ₱200, ₱1.2K, ₱15K (previously every value under ₱2,000 showed as ₱1K)
const compactPeso = (v) =>
  "₱" + Number(v || 0).toLocaleString("en-PH", { notation: "compact", maximumFractionDigits: 1 });

// MINI LINE CHART
function MiniChart({ id, data, color }) {
  // Redraw only when the values change, not on every parent render
  const dataKey = JSON.stringify(data ?? []);
  useEffect(() => {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const values = JSON.parse(dataKey);
    const hexToRgba = (hex, a) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    };
    const chart = new Chart(ctx, {
      type: "line",
      data: { labels: values.map((_,i)=>i), datasets: [{ data: values, borderColor: color, borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true, backgroundColor: (ctx2) => { const g = ctx2.chart.ctx.createLinearGradient(0,0,0,36); g.addColorStop(0,hexToRgba(color,0.18)); g.addColorStop(1,hexToRgba(color,0)); return g; } }] },
      options: { responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{x:{display:false},y:{display:false}} },
    });
    return () => chart.destroy();
  }, [id, color, dataKey]);
  return <div className="h-9 -mx-1 -mb-1 mt-1"><canvas id={id} /></div>;
}

// DONUT CHART
// No border: slices are separated by a small gap that shows the card color,
// so it looks right in both light and night mode (a white border showed as
// a white ring in night mode).
function DonutChart({ id, data, colors }) {
  const dataKey = JSON.stringify(data ?? []);
  const colorKey = JSON.stringify(colors ?? []);
  useEffect(() => {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: { datasets: [{ data: JSON.parse(dataKey), backgroundColor: JSON.parse(colorKey), borderWidth:0, spacing:2, hoverOffset:4 }] },
      options: { cutout:"65%", responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:"#fff", borderColor:"rgba(0,0,0,0.12)", borderWidth:1, bodyColor:"#1a2332", padding:8 } } },
    });
    return () => chart.destroy();
  }, [id, dataKey, colorKey]);
  return <canvas id={id} className="w-[90px] h-[90px]" />;
}

// SALES BAR CHART (real data)
// The present (this year / month / day) next to the past period picked on the
// calendar. Parts of the present that have not come yet are null (no bar or
// point), never zero. Rows: { label, present, picked }.
function SalesBarChart({ mode, chartData, yearLabel = "This Year", compareLabel = "Last Year" }) {
  const dataKey = JSON.stringify({ rows: chartData ?? [], yearLabel, compareLabel });
  useEffect(() => {
    const ctx = document.getElementById("salesChart");
    const { rows, yearLabel: yl, compareLabel: cl } = JSON.parse(dataKey);
    if (!ctx || !rows.length) return;
    const num = (v) => (v == null ? null : Number(v) || 0);
    const labels   = rows.map(m => m?.label ?? m?.month_name ?? "");
    const thisYear = rows.map(m => num(m?.present ?? m?.this_year));
    const lastYear = rows.map(m => num(m?.picked ?? m?.last_year));
    const chart = new Chart(ctx, {
      type: mode === "line" ? "line" : "bar",
      data: {
        labels,
        datasets: [
          { label:yl, data:thisYear, backgroundColor:"rgba(0,152,204,0.85)", borderColor:"#0098cc", borderWidth:mode==="line"?2:0, borderRadius:4, borderSkipped:false, tension:0.4, fill:false, pointRadius:mode==="line"?3:0, barPercentage:0.75, categoryPercentage:0.72 },
          { label:cl, data:lastYear, backgroundColor:"rgba(148,163,184,0.65)", borderColor:"#94a3b8", borderWidth:mode==="line"?2:0, borderRadius:4, borderSkipped:false, tension:0.4, fill:false, pointRadius:mode==="line"?3:0, barPercentage:0.75, categoryPercentage:0.72 },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend:{ display:true, position:"top", align:"end", labels:{ color:"#5a6a85", font:{size:11}, boxWidth:12, boxHeight:12, padding:14 } },
          tooltip:{ backgroundColor:"#fff", borderColor:"rgba(0,0,0,0.10)", borderWidth:1, titleColor:"#5a6a85", bodyColor:"#1a2332", padding:10, callbacks:{ label:(c)=>` ${c.dataset.label}: ₱${Number(c.raw || 0).toLocaleString()}` } },
        },
        scales: {
          x:{ grid:{display:false}, ticks:{color:"#94a3b8",font:{size:11}} },
          y:{ beginAtZero:true, grid:{color:"rgba(0,0,0,0.06)"}, ticks:{color:"#94a3b8", callback:(v)=>compactPeso(v)} },
        },
      },
    });
    return () => chart.destroy();
  }, [mode, dataKey]);
  return <canvas id="salesChart" height="180" />;
}

// How often Recent Notifications is refreshed from the server (works
// without Pusher; with Pusher a live event refreshes it right away).
const ACTIVITY_POLL_MS = 20000;

// "Just now", "5m ago", "3h ago", "Oct 4"
function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// MAIN COMPONENT
export default function Dashboard() {
  const navigate = useNavigate();
  const [chartMode, setChartMode] = useState("bar");
  // A stat card that opens a panel in place (Inventory Alerts): it is shown
  // selected and the other cards step back.
  const [activeCard, setActiveCard] = useState(null);
  // Sales Overview: Day / Month / Year, and a past date picked on the calendar
  // that is compared with the present (GET /api/bi/sales-chart). Empty value =
  // the period just before the present. Nothing after today can be picked.
  const [chartPeriod, setChartPeriod] = useState("month");
  const [chartValue, setChartValue] = useState("");
  const [salesChart, setSalesChart] = useState(null);
  const [chartError, setChartError] = useState("");
  const [biData,    setBiData]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [biError,   setBiError]   = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInfo,    setAiInfo]    = useState({ generatedAt: null, stale: false, message: "" });
  const [notifications, setNotifications] = useState([]);

  // Fetch BI Summary
  // silent = live refresh: keep the figures on screen while reloading
  const fetchBI = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const res  = await fetch("/api/bi/summary", {
        headers: { Accept:"application/json", Authorization:`Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      setBiData(await res.json());
      setBiError("");
    } catch {
      setBiError("Dashboard figures could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Groq AI Summary. The server keeps the last summary and asks Groq
  // again only when the figures changed (Groq's free tier allows few calls a
  // minute). refresh = the Refresh button: a new summary even with the same
  // figures, at most once in 5 minutes (the server decides).
  const fetchAI = useCallback(async (refresh = false) => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/bi/ai-summary${refresh ? "?refresh=1" : ""}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
        },
      });
      const data = await res.json();
      setAiSummary(data.summary || "No summary available.");
      setAiInfo({ generatedAt: data.generated_at || null, stale: !!data.stale, message: data.message || "" });
    } catch {
      setAiSummary("AI summary unavailable at this time.");
      setAiInfo({ generatedAt: null, stale: false, message: "" });
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBI();
  }, [fetchBI]);

  // The figures the AI summary is written from. The dashboard reloads biData
  // every 30 seconds; the summary is asked for only when these change.
  const aiInputs = biData ? JSON.stringify([
    biData.sales?.this_month_total, biData.sales?.mom_change_pct,
    biData.deliveries?.total, biData.deliveries?.delivery_rate_pct,
    biData.inventory?.out_of_stock, biData.inventory?.low_stock,
    biData.attendance?.total_in, biData.attendance?.total_employees,
    biData.overdue?.total_overdue_amount, biData.overdue?.overdue_customers,
  ]) : null;

  useEffect(() => {
    if (aiInputs) fetchAI();
  }, [aiInputs, fetchAI]);

  // Recent Notifications: the latest events read from the database
  // (GET /api/bi/recent-activity), refreshed every 20 seconds. Entries from
  // the last 10 minutes get the unread dot.
  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/bi/recent-activity", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const list = await res.json();
      if (Array.isArray(list)) setNotifications(list);
    } catch {
      // keep the current list; the next refresh tries again
    }
  }, []);

  // any live notice (lib/live.js) refreshes the list right away
  const live = useLiveTick(["*"]);

  // Realtime graphs: figures and the sales chart reload on every live notice
  // and every 30 seconds, without showing the loading state again.
  const fetchSalesChart = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ period: chartPeriod, ...(chartValue ? { value: chartValue } : {}) });
      const res = await fetch(`/api/bi/sales-chart?${qs}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setChartError(data?.message || "The chart could not be loaded."); return; }
      setChartError("");
      setSalesChart(data);
    } catch {
      setChartError("The chart could not be loaded.");
    }
  }, [chartPeriod, chartValue]);
  useEffect(() => { fetchSalesChart(); }, [fetchSalesChart, live]);
  useEffect(() => { if (live) fetchBI(true); }, [live, fetchBI]);
  useEffect(() => {
    const id = setInterval(() => { fetchBI(true); fetchSalesChart(); }, 30000);
    return () => clearInterval(id);
  }, [fetchBI, fetchSalesChart]);
  useEffect(() => {
    fetchActivity();
    const id = setInterval(fetchActivity, ACTIVITY_POLL_MS);
    return () => clearInterval(id);
  }, [fetchActivity, live]);

  // With Pusher configured, a live event refreshes the list and the figures
  // at once instead of waiting for the next poll.
  useEffect(() => {
    const refresh = () => { fetchActivity(); fetchBI(); };
    echo.channel('attendance').listen('.attendance.recorded', refresh);
    echo.channel('inventory').listen('.low.stock.alert', refresh);
    echo.channel('payments').listen('.payment.overdue', refresh);
    echo.channel('deliveries').listen('.delivery.status.updated', refresh);
    return () => {
      echo.leaveChannel('attendance');
      echo.leaveChannel('inventory');
      echo.leaveChannel('payments');
      echo.leaveChannel('deliveries');
    };
  }, [fetchBI, fetchActivity]);

  // Look of each notification type in Recent Notifications
  const NOTE_STYLE = {
    attendance: { bg: "bg-amber-100",   color: "text-amber-600",   icon: <ClockIconLocal /> },
    deliveries: { bg: "bg-green-100",   color: "text-green-600",   icon: <TruckIcon /> },
    inventory:  { bg: "bg-red-100",     color: "text-red-500",     icon: <AlertIcon /> },
    payment:    { bg: "bg-red-100",     color: "text-red-500",     icon: <DollarIcon /> },
    receipts:   { bg: "bg-emerald-100", color: "text-emerald-600", icon: <DollarIcon /> },
    support:    { bg: "bg-cyan-100",    color: "text-cyan-600",    icon: <MessageIconLocal /> },
    people:     { bg: "bg-violet-100",  color: "text-violet-600",  icon: <PeopleIconLocal /> },
    other:      { bg: "bg-slate-100",   color: "text-slate-500",   icon: <BellIconLocal /> },
  };
  const noteStyle = (n) => NOTE_STYLE[n.type] || NOTE_STYLE[PEOPLE_MODULES.includes(n.module) ? "people" : "other"];

  // Clicking a notification opens the page it is about. Inventory belongs to
  // the Checker, so it scrolls to the Inventory Summary card here instead.
  const openNotification = (n) => {
    const to = NOTE_LINKS[n.module];
    if (to) { navigate(to); return; }
    document.getElementById("inventory-summary")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Derived values from real data
  const sales     = biData?.sales     || {};
  const deliveries= biData?.deliveries|| {};
  const inventory = biData?.inventory || {};
  const attendance= biData?.attendance|| {};
  const overdue   = biData?.overdue   || {};
  const forecast  = biData?.forecast  || {};
  const nextMonth = forecast.next_month || {};
  const productLabels = forecast.product_labels || {};
  const forecastHistory = forecast.history || [];
  const historyMax = Math.max(1, ...forecastHistory.map((h) => Number(h.revenue) || 0), Number(nextMonth.revenue) || 0);
  const driversToday = biData?.drivers_today || [];
  const stores = biData?.stores || [];
  const storesTotal = stores.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

  const salesMomUp  = (sales.mom_change_pct ?? 0) >= 0;
  const delMomUp    = (deliveries.mom_change_pct ?? 0) >= 0;
  const invTotal    = (inventory.low_stock || 0) + (inventory.out_of_stock || 0);

  const overdueCustomers = overdue.overdue_customers ?? 0;
  const hasOverdue       = (overdue.overdue_count || 0) > 0;

  // Stock bullet in the AI Summary: checks out of stock AND low stock
  // (previously it said "All items in stock" even with low-stock items)
  const outOfStock = inventory.out_of_stock || 0;
  const lowStock   = inventory.low_stock || 0;
  const stockBullet =
    outOfStock > 0
      ? { dot: "bg-red-500", text: <><span className="text-red-500 font-semibold">{outOfStock} item{outOfStock === 1 ? "" : "s"} out of stock</span> — reorder needed</> }
      : lowStock > 0
        ? { dot: "bg-amber-500", text: <><span className="text-amber-600 font-semibold">{lowStock} low-stock item{lowStock === 1 ? "" : "s"}</span> — reorder soon</> }
        : { dot: "bg-green-500", text: <span className="text-green-600 font-semibold">All items in stock</span> };

  // Inventory donut data, single-hue blue palette (dark to light)
  const invDonutData = [inventory.in_stock||0, inventory.low_stock||0, inventory.out_of_stock||0];
  const invDonutTotal = invDonutData.reduce((a,b)=>a+b,0) || 1;

  // Delivery donut data, single-hue blue palette (dark to light)
  const delDonutData = [deliveries.delivered||0, deliveries.in_transit||0, deliveries.pending||0, deliveries.cancelled||0];
  const delTotal     = deliveries.total || 1;

  // No figures yet (loading, or the request failed): show dashes, not zeros
  const noFigures = loading || !biData;

  const linkClass = "text-[11px] text-cyan-500 cursor-pointer hover:text-cyan-400 transition-colors bg-transparent border-0 p-0";

  return (
    <AdminLayout
      pageTitle="Dashboard"
      breadcrumb="Dashboard"
    >
      {biError && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
          <span>{biError} The numbers below are not up to date.</span>
          <button onClick={fetchBI} className="font-medium underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 text-amber-700">Retry</button>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-3">

        {/* PRIMARY METRIC: Total Sales (opens Receipts) */}
        <div
          onClick={() => navigate("/admin/receipts")}
          title="Open Invoices"
          className={`col-span-2 md:col-span-1 bg-white border border-black/[0.09] rounded-xl p-5 flex flex-col gap-1.5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-150 ${activeCard ? "opacity-60" : ""}`}
        >
          <span className="text-[11px] font-medium tracking-[0.02em] text-slate-400">Total Sales (This Month)</span>
          <div className="text-[26px] font-semibold tracking-tight leading-tight text-slate-800 tabular-nums">
            {fmt(sales.this_month_total)}
          </div>
          <div className={`flex items-center gap-1 text-[11px] font-medium ${salesMomUp ? "text-green-600" : "text-red-500"}`}>
            {salesMomUp ? <ArrowUp /> : <ArrowDown />}
            {noFigures ? "—" : `${Math.abs(sales.mom_change_pct ?? 0)}% vs last month`}
          </div>
          <div className="text-[11px] text-slate-400">{sales.current_month || "This Month"}</div>
          {(sales.monthly_chart||[]).length > 0 && (
            <MiniChart id="chart-sales" data={(sales.monthly_chart||[]).map(m=>m.this_year)} color="#3b82f6" />
          )}
        </div>

        {/* SECONDARY METRICS: a card is clickable only when it has a page to open */}
        {[
          {
            label: "Total Deliveries",
            value: noFigures ? "—" : String(deliveries.total || 0),
            up: delMomUp,
            delta: noFigures ? "—" : `${Math.abs(deliveries.mom_change_pct ?? 0)}% vs last month`,
            context: `${deliveries.delivery_rate_pct || 0}% delivered`,
            to: "/admin/deliveries",
          },
          {
            label: "Inventory Alerts",
            value: noFigures ? "—" : String(invTotal),
            up: false,
            delta: `${inventory.out_of_stock || 0} out of stock`,
            context: `${inventory.low_stock || 0} low stock items`,
            panel: "inventory",
          },
          {
            label: "Attendance Today",
            value: noFigures ? "—" : `${attendance.total_in || 0}/${attendance.total_employees || 0}`,
            up: (attendance.attendance_rate || 0) >= 80,
            delta: `${attendance.attendance_rate || 0}% attendance rate`,
            context: "Present today",
          },
          {
            label: "Overdue Receivables",
            value: noFigures ? "—" : fmt(overdue.total_overdue_amount),
            up: null,
            delta: `${overdueCustomers} customer${overdueCustomers === 1 ? "" : "s"}`,
            context: hasOverdue ? "Action needed" : "All current",
            isAlert: true,
            to: "/admin/receipts",
          },
        ].map((card) => {
          const clickable = card.to || card.panel;
          const selected = card.panel && activeCard === card.panel;
          const open = () => (card.panel ? setActiveCard((a) => (a === card.panel ? null : card.panel)) : navigate(card.to));
          return (
          <div
            key={card.label}
            onClick={clickable ? open : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-expanded={card.panel ? selected : undefined}
            data-selected={selected || undefined}
            title={card.panel ? (selected ? "Hide the stock alerts" : "Show the stock alerts") : card.to ? "Open details" : undefined}
            className={`stat-card bg-white border border-black/[0.09] rounded-xl p-5 flex flex-col gap-1.5 transition-all duration-150 ${clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-px" : ""} ${activeCard && !selected ? "opacity-60" : ""}`}
          >
            <span className={`text-[11px] font-medium tracking-[0.02em] ${card.isAlert ? "text-red-400" : "text-slate-400"}`}>
              {card.label}
            </span>
            <div className={`text-[26px] font-semibold tracking-tight leading-tight tabular-nums ${card.isAlert ? "text-red-500" : "text-slate-800"}`}>
              {card.value}
            </div>
            {card.up !== null ? (
              <div className={`flex items-center gap-1 text-[11px] font-medium ${card.up ? "text-green-600" : "text-red-500"}`}>
                {card.up ? <ArrowUp /> : <ArrowDown />}{card.delta}
              </div>
            ) : (
              <div className="text-[11px] text-red-400 font-medium">{card.delta} — {card.context}</div>
            )}
            {card.up !== null && <div className="text-[11px] text-slate-400">{card.context}</div>}
          </div>
          );
        })}
      </div>

      {activeCard === "inventory" && (
        <div className="bg-white border border-black/[0.09] rounded-xl p-[18px]" role="region" aria-label="Stock alerts">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-[13px] font-semibold text-slate-800">Stock alerts</div>
              <div className="text-[11px] text-slate-400">{inventory.out_of_stock || 0} out of stock · {inventory.low_stock || 0} low stock</div>
            </div>
            <button type="button" onClick={() => navigate("/admin/stock-limits")} className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-[12px] text-slate-600 hover:bg-slate-50 cursor-pointer">Open Stock Limits</button>
          </div>
          {(inventory.critical_items || []).length === 0 ? (
            <div className="text-[12px] text-slate-400">Every supply is above its minimum stock.</div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {inventory.critical_items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                  <span className="min-w-0">
                    <span className="text-slate-800 font-medium">{it.name}</span>
                    <span className="text-slate-400"> · {it.product_code}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="tabular-nums text-slate-600">{it.current_stock} / min {it.minimum_stock} {it.unit || ""}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${it.status === "out_of_stock" ? "bg-[#fde8ec] text-[#9f1239] border-[#fbcfd8]" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {it.status === "out_of_stock" ? "Out of stock" : "Low stock"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* LEFT: sales, inventory, delivery, attendance. RIGHT: AI summary,
          notifications, overdue receivables. Each column stacks on its own,
          so a taller card in one column never leaves a gap in the other. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">

        {/* LEFT */}
        <div className="flex flex-col gap-3 min-w-0">

          {/* Sales Chart */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Sales Overview</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{sales.current_month || "This Month"}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center bg-slate-100 rounded-md p-0.5 gap-0.5">
                  {["bar","line"].map((m) => (
                    <button key={m} onClick={() => setChartMode(m)} aria-pressed={chartMode === m} className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors border-0 cursor-pointer capitalize ${chartMode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 bg-transparent hover:text-slate-600"}`}>{m}</button>
                  ))}
                </div>
                <div className="flex items-center bg-slate-100 rounded-md p-0.5 gap-0.5" role="group" aria-label="Compare by">
                  {[["day","Day"],["month","Month"],["year","Year"]].map(([k, label]) => (
                    <button key={k} onClick={() => { setChartPeriod(k); setChartValue(""); }} aria-pressed={chartPeriod === k} className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors border-0 cursor-pointer ${chartPeriod === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 bg-transparent hover:text-slate-600"}`}>{label}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 bg-slate-100 rounded-md p-0.5 pl-2 text-[10px] text-slate-400">
                  {chartPeriod === "year" && <CalendarIconLocal />}
                  <span className="sr-only">Compare with</span>
                  {chartPeriod === "year" ? (
                    <select
                      value={salesChart?.period === "year" ? salesChart.picked_value : ""}
                      onChange={(e) => setChartValue(e.target.value)}
                      aria-label="Year to compare with this year"
                      className="px-2 py-1 rounded bg-white shadow-sm text-[10px] font-medium text-slate-800 outline-none cursor-pointer"
                    >
                      {Array.from({ length: Math.max(1, Number(salesChart?.max_value || new Date().getFullYear()) - Number(salesChart?.first_year || new Date().getFullYear() - 1)) }, (_, i) => Number(salesChart?.max_value || new Date().getFullYear()) - 1 - i)
                        .map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  ) : (
                    <input
                      type={chartPeriod === "day" ? "date" : "month"}
                      value={salesChart?.period === chartPeriod ? salesChart.picked_value : ""}
                      max={salesChart?.period === chartPeriod ? salesChart.max_value : undefined}
                      onChange={(e) => e.target.value && setChartValue(e.target.value)}
                      aria-label={chartPeriod === "day" ? "Day to compare with today" : "Month to compare with this month"}
                      className="px-2 py-1 rounded bg-white shadow-sm text-[10px] font-medium text-slate-800 outline-none cursor-pointer"
                    />
                  )}
                  <span className="pr-2 whitespace-nowrap">vs {chartPeriod === "day" ? "today" : chartPeriod === "month" ? "this month" : "this year"}</span>
                </label>
              </div>
            </div>
            <div className="px-[18px] pt-4 pb-0">
              {chartError && <div className="mb-2 text-[11px] text-red-600">{chartError}</div>}
              <SalesBarChart
                mode={chartMode}
                chartData={salesChart?.points || []}
                yearLabel={salesChart ? `${salesChart.present_label} (now)` : "Now"}
                compareLabel={salesChart?.picked_label || "Before"}
              />
            </div>
            <div className="grid grid-cols-5 border-t border-black/[0.09]">
              {[
                ["Total Sales",      fmt(sales.this_month_total),  false],
                ["Total Invoices",    String(sales.total_orders||0), false],
                ["Avg Invoice Value", fmt(sales.avg_order_value),   false],
                ["Paid",             fmt(sales.paid_this_month),   false],
                ["Unpaid",           fmt(sales.unpaid_this_month), true ],
              ].map(([label,val,danger],i) => (
                <div key={label} className={`px-[18px] py-3 ${i < 4 ? "border-r border-black/[0.09]" : ""}`}>
                  <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
                  <div className={`text-[13px] font-semibold font-mono ${danger ? "text-red-500" : "text-slate-800"}`}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* MRR and next month's estimate (GET /api/bi/summary -> forecast) */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Forecast · {nextMonth.label || "Next month"}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {nextMonth.method === "trend" ? "From the trend of the last 6 months of invoices"
                    : nextMonth.method === "this_month" ? "From this month's sales so far (no complete month yet)"
                    : "From the average month so far (less than 3 months of sales)"}
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#579bfc]/10 text-[#3a7fe0] font-semibold">Estimate</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1.6fr] divide-x divide-black/[0.06]">
              <div className="px-[18px] py-3.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">MRR</div>
                <div className="text-[22px] font-semibold text-slate-800 font-mono">{noFigures ? "—" : fmt(forecast.mrr)}</div>
                <div className="text-[10px] text-slate-400">
                  {nextMonth.method === "this_month" ? "This month's pace" : `${forecast.regular_customers || 0} regular store${forecast.regular_customers === 1 ? "" : "s"} · avg of last 3 months`}
                </div>
              </div>
              <div className="px-[18px] py-3.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Revenue next month</div>
                <div className="text-[22px] font-semibold text-slate-800 font-mono">{noFigures ? "—" : fmt(nextMonth.revenue)}</div>
                {nextMonth.change_pct != null && (
                  <div className={`flex items-center gap-1 text-[10px] font-medium ${nextMonth.change_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {nextMonth.change_pct >= 0 ? <ArrowUp /> : <ArrowDown />}{Math.abs(nextMonth.change_pct)}% vs last month
                  </div>
                )}
              </div>
              <div className="col-span-2 md:col-span-1 px-[18px] py-3.5 border-t md:border-t-0 border-black/[0.06]">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Ice to prepare next month</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(nextMonth.quantity || {}).map(([k, q]) => (
                    <div key={k} className="rounded-md overflow-hidden border border-black/[0.06]">
                      <StatusCell tone="info">{q.toLocaleString("en-PH")}</StatusCell>
                      <div className="text-[10px] text-center text-slate-500 py-1 px-1 truncate">{productLabels[k] || k}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {forecastHistory.length > 0 && (
              <div className="px-[18px] py-3 border-t border-black/[0.06]">
                <div className="flex items-end gap-1.5 h-16" aria-label="Invoice totals of the last 6 months">
                  {[...forecastHistory, { label: `${nextMonth.label || "Next"} (est.)`, revenue: nextMonth.revenue, estimate: true }].map((h) => (
                    <div key={h.label} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${h.label}: ${fmt(h.revenue)}`}>
                      <div
                        className={`w-full rounded-t ${h.estimate ? "bg-[#579bfc]/40 border border-dashed border-[#579bfc]" : "bg-[#579bfc]"}`}
                        style={{ height: `${Math.max(3, (Number(h.revenue) / historyMax) * 48)}px` }}
                      />
                      <span className="text-[9px] text-slate-400 truncate w-full text-center">{h.label.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inventory + Delivery */}
          <div className="grid grid-cols-2 gap-3">

            {/* Inventory Summary (no "View all": inventory pages belong to the Checker) */}
            <div id="inventory-summary" className="scroll-mt-4 bg-white border border-black/[0.09] rounded-xl overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
                <div className="text-[13px] font-semibold text-slate-800">Inventory Summary</div>
                <span className="text-[10px] text-slate-400">Managed by Checker</span>
              </div>
              <div className="flex items-start gap-6 p-[18px]">
                <div className="w-[90px] h-[90px] flex-shrink-0">
                  <DonutChart id="invDonut" data={invDonutData} colors={["#0c4a6e","#0284c7","#bae6fd"]} />
                </div>
                <div className="flex-1 flex flex-col gap-2.5">
                  {[
                    ["#0c4a6e","In Stock",     `${Math.round((inventory.in_stock||0)/invDonutTotal*100)}%`,    inventory.in_stock||0],
                    ["#0284c7","Low Stock",    `${Math.round((inventory.low_stock||0)/invDonutTotal*100)}%`,   inventory.low_stock||0],
                    ["#bae6fd","Out of Stock", `${Math.round((inventory.out_of_stock||0)/invDonutTotal*100)}%`,inventory.out_of_stock||0],
                  ].map(([color,label,p,val]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                      <div><div className="text-xs text-slate-500">{label}</div><div className="text-[10px] text-slate-400">{p}</div></div>
                      <div className="text-xs font-semibold text-slate-800 font-mono ml-auto">{val}</div>
                    </div>
                  ))}
                  <div className="mt-1.5 pt-2.5 border-t border-black/[0.09] w-full">
                    <div className="text-[10px] text-slate-400">Total Products</div>
                    <div className="text-xl font-semibold text-slate-800 font-mono">{inventory.total||0}</div>
                  </div>
                </div>
              </div>
              <div className="border-t border-black/[0.09] px-[18px] pb-3 pt-2.5">
                <div className="text-[10px] tracking-widest uppercase text-slate-400 mb-2">Critical Stock Items</div>
                {(inventory.critical_items||[]).length === 0 && (
                  <div className="text-[11px] text-slate-400 py-1">No critical items</div>
                )}
                {(inventory.projects||[]).length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] tracking-widest uppercase text-slate-400">Projects</span>
                      <button onClick={() => navigate("/admin/projects")} className={linkClass}>Board →</button>
                    </div>
                    {inventory.projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate("/admin/projects")}
                        className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 text-xs text-left border-b border-black/[0.06] last:border-b-0 cursor-pointer hover:bg-slate-50"
                      >
                        <span className="truncate text-slate-800">{p.name}{p.overdue && <span className="ml-1 text-[10px] text-[#d83a52] font-semibold">overdue</span>}</span>
                        <span className="text-[10px] font-mono text-slate-500">{fmt(p.materials_cost)}</span>
                        <StatusCell tone={{ working: "working", stuck: "stuck", planned: "info" }[p.status] || "idle"} className="min-h-[20px] rounded px-1.5 text-[10px]">
                          {{ working: "Working", stuck: "Stuck", planned: "Planned" }[p.status] || p.status}
                        </StatusCell>
                      </button>
                    ))}
                  </div>
                )}
                {(inventory.critical_items||[]).map((item, i, arr) => (
                  <div key={item.id} className={`flex justify-between items-center py-1.5 text-xs ${i < arr.length-1 ? "border-b border-black/[0.09]" : ""}`}>
                    <span className={item.current_stock === 0 ? "text-red-500 font-medium" : "text-slate-800"}>{item.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.current_stock === 0 ? "bg-red-100 text-red-500" : "bg-amber-100 text-amber-600"}`}>
                      {item.current_stock === 0 ? "0 left" : `${item.current_stock} left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Status */}
            <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
                <div className="text-[13px] font-semibold text-slate-800">Delivery Status</div>
                <button onClick={() => navigate("/admin/deliveries")} className={linkClass}>View all →</button>
              </div>
              <div className="flex items-start gap-6 p-[18px]">
                <div className="w-[90px] h-[90px] flex-shrink-0">
                  <DonutChart id="delDonut" data={delDonutData} colors={["#0c4a6e","#0284c7","#38bdf8","#bae6fd"]} />
                </div>
                <div className="flex-1 flex flex-col gap-2.5">
                  {[
                    ["#0c4a6e","Delivered",  `${Math.round((deliveries.delivered||0)/delTotal*100)}%`,  deliveries.delivered||0],
                    ["#0284c7","In Transit", `${Math.round((deliveries.in_transit||0)/delTotal*100)}%`, deliveries.in_transit||0],
                    ["#38bdf8","Pending",    `${Math.round((deliveries.pending||0)/delTotal*100)}%`,    deliveries.pending||0],
                    ["#bae6fd","Cancelled",  `${Math.round((deliveries.cancelled||0)/delTotal*100)}%`,  deliveries.cancelled||0],
                  ].map(([color,label,p,val]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                      <div>
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="text-[10px] text-slate-400">{p}</div>
                      </div>
                      <div className="text-xs font-semibold font-mono ml-auto text-slate-800">{val}</div>
                    </div>
                  ))}
                  <div className="mt-1.5 pt-2.5 border-t border-black/[0.09] w-full">
                    <div className="text-[10px] text-slate-400">Total Deliveries</div>
                    <div className="text-xl font-semibold text-slate-800 font-mono">{deliveries.total||0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Summary */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09]">
              <div className="text-[13px] font-semibold text-slate-800">Attendance Today</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{attendance.date || "Today"}</div>
            </div>
            <div className="grid grid-cols-5 divide-x divide-black/[0.06]">
              {[
                ["Present",  attendance.present||0],
                ["Late",     attendance.late||0],
                ["Absent",   attendance.absent||0],
                ["Half Day", attendance.half_day||0],
                ["On Leave", attendance.on_leave||0],
              ].map(([label,val]) => (
                <div key={label} className="px-[18px] py-3 text-center">
                  <div className="text-[22px] font-semibold font-mono text-slate-800">{val}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            <div className="px-[18px] py-2.5 border-t border-black/[0.06] flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Attendance Rate</span>
              <span className="text-[13px] font-semibold text-slate-800 font-mono">{attendance.attendance_rate||0}% ({attendance.total_in||0} / {attendance.total_employees||0})</span>
            </div>
            {/* Drivers: time in / out from the Attendance Station, and today's deliveries */}
            <div className="px-[18px] pt-3 pb-4 border-t border-black/[0.06]">
              <BoardGroup
                title="Drivers today"
                tone="info"
                count={driversToday.length}
                empty="No active drivers."
                columns={[{ label: "Driver" }, { label: "Time in" }, { label: "Time out" }, { label: "Delivered" }, { label: "On the road" }, { label: "Pending" }]}
              >
                {driversToday.map((d) => (
                  <BoardRow
                    key={d.employee_id}
                    tone={d.time_in ? (d.time_out ? "idle" : "done") : "stuck"}
                    onClick={() => navigate("/admin/deliveries")}
                    title="Open deliveries"
                    cells={[
                      <span key="n">{d.name}{d.vehicle_plate && <span className="ml-1.5 text-[10px] font-mono text-slate-400">{d.vehicle_plate}</span>}</span>,
                      d.time_in ? <StatusCell tone="done">{clock(d.time_in)}</StatusCell> : <StatusCell tone="stuck">Not in</StatusCell>,
                      d.time_out ? <StatusCell tone="idle">{clock(d.time_out)}</StatusCell> : <StatusCell tone={d.time_in ? "working" : "idle"}>{d.time_in ? "Working" : "—"}</StatusCell>,
                      <span key="dl" className="font-semibold text-slate-800">{d.delivered}</span>,
                      d.in_transit ? <StatusCell tone="working">{d.in_transit}</StatusCell> : "0",
                      d.pending ? <StatusCell tone="info">{d.pending}</StatusCell> : "0",
                    ]}
                  />
                ))}
              </BoardGroup>
            </div>
          </div>

          {/* Store performance this month */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Store Performance</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{sales.current_month || "This month"} · deliveries received and invoiced, best first</div>
              </div>
              <button onClick={() => navigate("/admin/customers")} className={linkClass}>Customers →</button>
            </div>
            <div className="p-[18px]">
              <BoardGroup
                title="Top stores"
                tone="purple"
                count={stores.length}
                empty="No invoices yet this month."
                columns={[{ label: "Store" }, { label: "Deliveries" }, { label: "Ice qty" }, { label: "Sales" }, { label: "Unpaid" }, { label: "Share" }]}
              >
                {stores.map((s) => {
                  const share = storesTotal ? Math.round((s.revenue / storesTotal) * 100) : 0;
                  return (
                    <BoardRow
                      key={s.customer_id}
                      tone="purple"
                      onClick={() => navigate("/admin/receipts")}
                      title="Open invoices"
                      cells={[
                        <span key="n">
                          {s.invoice_code && <span className="mr-1.5 px-1.5 py-px rounded bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-700">{s.invoice_code}</span>}
                          {s.name}
                        </span>,
                        s.deliveries,
                        s.quantity,
                        <span key="r" className="font-mono font-semibold text-slate-800">{fmt(s.revenue)}</span>,
                        s.unpaid > 0 ? <StatusCell tone="stuck">{fmt(s.unpaid)}</StatusCell> : <StatusCell tone="done">Paid</StatusCell>,
                        <div key="sh" className="flex items-center gap-1.5 min-w-[90px]">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-[#a25ddc]" style={{ width: `${share}%` }} /></div>
                          <span className="text-[10px] text-slate-500 w-7 text-right">{share}%</span>
                        </div>,
                      ]}
                    />
                  );
                })}
              </BoardGroup>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-3">

          {/* AI Summary */}
          <div className="bg-white border border-cyan-200 rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-cyan-100 flex items-center justify-between bg-cyan-500/[0.04]">
              <div className="text-[13px] font-semibold text-slate-800">AI Summary</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-500 rounded-full font-mono">Groq</span>
                <button
                  type="button"
                  onClick={() => fetchAI(true)}
                  disabled={aiLoading}
                  title="Ask for a new summary (at most once in 5 minutes)"
                  aria-label="Refresh AI summary"
                  className="p-1 rounded-md text-slate-400 hover:text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={`block ${aiLoading ? "animate-spin" : ""}`}><RefreshIcon /></span>
                </button>
              </div>
            </div>
            <div className="p-[18px]">
              {aiLoading && !aiSummary ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-3 h-3 border-2 border-cyan-400/40 border-t-cyan-500 rounded-full animate-spin" />
                  Generating AI summary…
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">{aiSummary || "No summary available."}</p>
                  {(aiInfo.generatedAt || aiInfo.message) && (
                    <p className={`mt-1.5 text-[10px] ${aiInfo.stale ? "text-amber-600" : "text-slate-400"}`}>
                      {aiInfo.generatedAt && `Updated ${updatedAt(aiInfo.generatedAt)}`}
                      {aiInfo.stale && aiInfo.generatedAt && " (older figures)"}
                      {aiInfo.message && `${aiInfo.generatedAt ? " · " : ""}${aiInfo.message}`}
                    </p>
                  )}
                </>
              )}
              <div className="border-t border-black/[0.09] pt-2.5 mt-2.5 flex flex-col gap-1.5">
                {[
                  { dot:"bg-green-500", text:<>Delivery rate: <span className="text-slate-800 font-semibold">{deliveries.delivery_rate_pct||0}%</span> completed</> },
                  { dot:(deliveries.pending||0)>0?"bg-amber-500":"bg-green-500", text:<><span className="text-slate-800 font-semibold">{deliveries.pending||0} pending deliveries</span> today</> },
                  stockBullet,
                ].map((item,i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dot}`} />
                    <span className="text-slate-500">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Notifications: latest events from the server, refreshed every 20s */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-800">Recent Notifications</div>
              <span className="text-[10px] text-slate-400">Live</span>
            </div>
            {notifications.length === 0 && (
              <EmptyState icon="bell" compact>No notifications yet. Every action that reaches Admin appears here. Click one to open it.</EmptyState>
            )}
            {/* Scrolls inside the card so new live entries never push the layout */}
            <div className="max-h-[280px] overflow-y-auto">
              {notifications.map((n,i,arr) => {
                const look = noteStyle(n);
                const fresh = Date.now() - new Date(n.at).getTime() < 10 * 60 * 1000;
                return (
                <button type="button" key={n.key} onClick={() => openNotification(n)} title="Open"
                  className={`w-full text-left flex items-start gap-2.5 pl-[18px] pr-8 py-3 relative cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 outline-none transition-colors ${i < arr.length-1 ? "border-b border-black/[0.09]" : ""}`}>
                  <div className={`w-[30px] h-[30px] rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${look.bg} ${look.color}`}>{look.icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800">{n.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words">{n.body}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.at)}</div>
                  </div>
                  {fresh && <div className="absolute right-[18px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-500" aria-label="New" />}
                </button>
                );
              })}
            </div>
          </div>

          {/* Overdue Receivables (opens Receipts): shown only when something is overdue */}
          {(overdue.receipts || []).length > 0 && (
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-red-100 bg-red-50/40 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Overdue Receivables</div>
                <div className="text-[10px] text-red-400 mt-0.5">{hasOverdue ? "Action required" : "All current"}</div>
              </div>
              <button onClick={() => navigate("/admin/receipts")} className={linkClass}>View all</button>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {(overdue.receipts||[]).map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate("/admin/receipts")}
                  title={r.receipt_no}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center px-[18px] py-2.5 border-b border-black/[0.09] last:border-b-0 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="text-xs text-slate-800 font-medium truncate">{r.customer_name}</div>
                  <div className="text-xs text-slate-800 font-mono font-semibold">{fmt(r.total_amount)}</div>
                  <div className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${r.days_overdue > 15 ? "bg-red-100 text-red-500" : "bg-amber-100 text-amber-600"}`}>{r.days_overdue} days</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-[18px] py-3 border-t border-red-100 bg-red-50/40">
              <span className="text-[11px] text-slate-400 font-medium">Total Overdue</span>
              <span className="text-sm font-bold text-red-500 font-mono">{fmt(overdue.total_overdue_amount)}</span>
            </div>
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// Where each notification opens (module from the server). HR records open
// Admin's Employees overview; inventory has no Admin page (see openNotification).
const NOTE_LINKS = {
  deliveries: "/admin/deliveries",
  receipts: "/admin/receipts",
  "stock-out": "/admin/stock-out-approvals",
  support: "/admin/support-inbox",
  customers: "/admin/customers",
  prices: "/admin/customer-prices",
  leave: "/admin/employees",
  attendance: "/admin/employees",
  employees: "/admin/employees",
  face: "/admin/employees",
  applicants: "/admin/employees",
  payroll: "/admin/employees",
};
const PEOPLE_MODULES = ["leave", "employees", "face", "applicants", "payroll", "customers"];
const MessageIconLocal = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const PeopleIconLocal = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const BellIconLocal = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const CalendarIconLocal = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const ClockIconLocal = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;