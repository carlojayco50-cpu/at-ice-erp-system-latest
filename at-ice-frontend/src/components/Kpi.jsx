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
import { Icon } from "./icons";

// Same icon set as every other screen (components/icons.jsx).
export function KpiIcon({ name, className = "" }) {
  return <Icon name={name} size={16} className={className} />;
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
