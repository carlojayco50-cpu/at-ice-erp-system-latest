import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Chart } from "chart.js/auto";
import echo from "../../echo";
import AdminLayout from "../../components/AdminLayout";
import EmptyState from "../../components/EmptyState";
import { useLiveTick } from "../../lib/live";

const DollarIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const AlertIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const TruckIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const ArrowUp    = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>;
const ArrowDown  = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 9 12 15 6 9"/></svg>;
const RefreshIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;

// HELPERS
const fmt  = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const token = () => localStorage.getItem("token") || "";

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

  // Fetch Groq AI Summary
  const fetchAI = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/bi/ai-summary", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
        },
      });
      const data = await res.json();
      setAiSummary(data.summary || "No summary available.");
    } catch {
      setAiSummary("AI summary unavailable at this time.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBI();
  }, [fetchBI]);

  useEffect(() => {
    if (biData) fetchAI();
  }, [biData, fetchAI]);

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
      headerActions={
        <button
          onClick={fetchBI}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-500 transition-colors"
        >
          <RefreshIcon /> Refresh
        </button>
      }
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
          title="Open Receipts"
          className="col-span-2 md:col-span-1 bg-white border border-black/[0.09] rounded-xl p-5 flex flex-col gap-1.5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-150"
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
        ].map((card) => (
          <div
            key={card.label}
            onClick={card.to ? () => navigate(card.to) : undefined}
            title={card.to ? "Open details" : undefined}
            className={`bg-white border border-black/[0.09] rounded-xl p-5 flex flex-col gap-1.5 transition-all duration-150 ${card.to ? "cursor-pointer hover:shadow-md hover:-translate-y-px" : ""}`}
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
        ))}
      </div>

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
                ["Total Receipts",    String(sales.total_orders||0), false],
                ["Avg Receipt Value", fmt(sales.avg_order_value),   false],
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
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-3">

          {/* AI Summary */}
          <div className="bg-white border border-cyan-200 rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-cyan-100 flex items-center justify-between bg-cyan-500/[0.04]">
              <div className="text-[13px] font-semibold text-slate-800">AI Summary</div>
              <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-500 rounded-full font-mono">Groq</span>
            </div>
            <div className="p-[18px]">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-3 h-3 border-2 border-cyan-400/40 border-t-cyan-500 rounded-full animate-spin" />
                  Generating AI summary…
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">{aiSummary || "No summary available."}</p>
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

          {/* Overdue Receivables (opens Receipts) */}
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-red-100 bg-red-50/40 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Overdue Receivables</div>
                <div className="text-[10px] text-red-400 mt-0.5">{hasOverdue ? "Action required" : "All current"}</div>
              </div>
              <button onClick={() => navigate("/admin/receipts")} className={linkClass}>View all</button>
            </div>
            {(overdue.receipts||[]).length === 0 && (
              <div className="px-[18px] py-4 text-[11px] text-slate-400">No overdue receivables</div>
            )}
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