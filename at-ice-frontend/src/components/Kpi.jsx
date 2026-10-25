// Executive KPI cards, the same on every module page (owner, 2026-10-21):
// a label with an icon badge, the main number in even-width digits, and one
// line of context under it (a ratio, a share, a trend or a small bar).
//
//   <KpiGrid>
//     <KpiCard label="Pending" icon="clock" tone="amber" value={12}
//       sub="of 40 this week" bar={12 / 40} />
//   </KpiGrid>
//
// value: a number (formatted here) or a ready string. money: show as ₱.
// bar: 0..1 for a thin progress bar. trend: { dir: "up" | "down" | "flat", text }.
// onClick makes the card a filter button (aria-pressed when active).
import { TONES } from "../lib/kpiTones";

const ICONS = {
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  x: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  box: "M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12",
  wallet: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z",
  receipt: "M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2zM8 7h8M8 11h8M8 15h4",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  store: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  tag: "M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  tool: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
  snow: "M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9",
  pin: "M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
};


export function KpiIcon({ name, className = "" }) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={ICONS[name] || ICONS.chart} />
    </svg>
  );
}

const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function KpiCard({ label, value, icon = "chart", tone = "cyan", sub, trend, bar, live = false, money = false, onClick, active = false, title }) {
  const t = TONES[tone] || TONES.cyan;
  const isNum = typeof value === "number" && Number.isFinite(value);
  const shown = value == null || value === "" ? "—" : isNum ? (money ? peso(value) : value.toLocaleString("en-PH")) : value;
  const pct = typeof bar === "number" && Number.isFinite(bar) ? Math.max(0, Math.min(1, bar)) : null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick, "aria-current": active ? "true" : undefined, "data-no-confirm": true } : {})}
      title={title}
      className={`kpi-card bg-white border border-black/[0.09] rounded-xl px-4 py-3.5 flex flex-col gap-2 text-left min-w-0 h-full ${onClick ? "cursor-pointer" : ""} ${active ? "kpi-card-active" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${t.badge}`}><KpiIcon name={icon} /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">{label}</span>
        {live && <span className="live-dot ml-auto w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Live" />}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[22px] leading-none font-semibold font-mono tabular-nums text-slate-800 truncate" {...(isNum ? { "data-fx-count": value } : {})}>
          {shown}
        </span>
        {trend && (
          <span className={`text-[11px] font-semibold whitespace-nowrap ${trend.dir === "up" ? "text-emerald-700" : trend.dir === "down" ? "text-rose-700" : "text-slate-500"}`}>
            {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "•"} {trend.text}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
      {pct != null && (
        <div className="kpi-bar h-1.5 rounded-full bg-black/[0.06] overflow-hidden mt-auto" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
          <span className={`block h-full rounded-full ${t.bar} ${live ? "is-live" : ""}`} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
    </Tag>
  );
}

// 2 across on phones, 3 on tablets, then `cols` (4 to 6) on wide screens; the
// cards in a row are always the same height.
export function KpiGrid({ cols = 4, children, className = "" }) {
  const wide = { 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" }[cols] || "xl:grid-cols-4";
  return <div className={`kpi-grid grid grid-cols-2 md:grid-cols-3 ${wide} gap-3 sm:gap-4 items-stretch ${className}`}>{children}</div>;
}
