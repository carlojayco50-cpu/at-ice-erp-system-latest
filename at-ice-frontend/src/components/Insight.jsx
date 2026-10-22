// Side panels that fill a page with useful facts from its own module
// (owner, 2026-10-21): a status breakdown, a recent-activity feed, quick
// actions, a tips widget, a small bar chart and a progress ring. They share
// one card look (InsightPanel) so every module reads the same.
import { KpiIcon } from "./Kpi";
import { TONES } from "../lib/kpiTones";
import EmptyState from "./EmptyState";

export function InsightPanel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`insight-panel bg-white border border-black/[0.09] rounded-xl flex flex-col min-w-0 ${className}`}>
      {(title || action) && (
        <div className="px-4 pt-3.5 pb-2 flex items-start gap-2">
          <div className="min-w-0 mr-auto">
            {title && <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-500 leading-snug">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="px-4 pb-4 flex-1 min-h-0">{children}</div>
    </section>
  );
}

// Share of each status: a labelled bar per item, with its count and percent.
//   items: [{ label, count, tone }]
export function StatusBreakdown({ title = "Status breakdown", subtitle, items, empty = "Nothing to break down yet.", onPick, active, footer }) {
  const total = items.reduce((s, i) => s + (i.count || 0), 0);
  return (
    <InsightPanel title={title} subtitle={subtitle ?? (total ? `${total.toLocaleString("en-PH")} in all` : undefined)}>
      {total === 0 ? (
        <EmptyState icon="clipboard" compact>{empty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((i) => {
            const pct = total ? (i.count || 0) / total : 0;
            const t = TONES[i.tone] || TONES.cyan;
            const Row = onPick ? "button" : "div";
            return (
              <li key={i.label}>
                <Row
                  {...(onPick ? { type: "button", onClick: () => onPick(i), "data-no-confirm": true, "aria-current": active === i.key ? "true" : undefined } : {})}
                  className={`w-full text-left ${onPick ? "cursor-pointer rounded-md" : ""} ${onPick && active === i.key ? "font-semibold" : ""}`}
                >
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.bar}`} />
                    <span className="text-slate-700 truncate mr-auto">{i.label}</span>
                    <span className="font-mono tabular-nums text-slate-800 font-semibold">{(i.count || 0).toLocaleString("en-PH")}</span>
                    <span className="font-mono tabular-nums text-slate-400 w-10 text-right">{Math.round(pct * 100)}%</span>
                  </div>
                  <div className="breakdown-bar mt-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                    <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${pct * 100}%` }} />
                  </div>
                </Row>
              </li>
            );
          })}
        </ul>
      )}
      {footer && <div className="mt-4 pt-3 border-t border-black/[0.06]">{footer}</div>}
    </InsightPanel>
  );
}

// Latest records of the module: [{ id, title, meta, when, tone, icon }]
export function ActivityFeed({ title = "Recent activity", subtitle, items, empty = "No recent activity yet.", max = 6 }) {
  const list = (items || []).slice(0, max);
  return (
    <InsightPanel title={title} subtitle={subtitle}>
      {list.length === 0 ? (
        <EmptyState icon="bell" compact>{empty}</EmptyState>
      ) : (
        <ol className="flex flex-col">
          {list.map((i, n) => {
            const t = TONES[i.tone] || TONES.slate;
            return (
              <li key={i.id ?? n} className="flex gap-2.5 py-2 border-t first:border-t-0 border-black/[0.06]">
                <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${t.badge}`}><KpiIcon name={i.icon || "clock"} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-slate-800 truncate">{i.title}</div>
                  {i.meta && <div className="text-[11px] text-slate-500 truncate">{i.meta}</div>}
                </div>
                {i.when && <span className="text-[10px] text-slate-400 whitespace-nowrap pt-0.5">{i.when}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </InsightPanel>
  );
}

// Buttons for the module's common jobs: [{ label, hint, icon, onClick, tone }]
export function QuickActions({ title = "Quick actions", actions }) {
  return (
    <InsightPanel title={title}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((a) => {
          const t = TONES[a.tone] || TONES.cyan;
          return (
            <button key={a.label} type="button" onClick={a.onClick} data-no-confirm title={a.hint || a.label}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-black/[0.09] bg-white text-left cursor-pointer min-w-0">
              <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${t.badge}`}><KpiIcon name={a.icon || "chart"} /></span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-slate-800 truncate">{a.label}</span>
                {a.hint && <span className="block text-[10.5px] text-slate-500 truncate">{a.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </InsightPanel>
  );
}

// Reminders that matter on this page; the effects layer shows one at a time.
//   tips: [{ title, text, tone, icon }]
export function TipsWidget({ title = "Reminders", tips }) {
  if (!tips?.length) return null;
  return (
    <InsightPanel title={title}>
      <div data-fx-cycle className="flex flex-col gap-2">
        {tips.map((tip) => {
          const t = TONES[tip.tone] || TONES.cyan;
          return (
            <div key={tip.title} className="flex gap-2.5 items-start">
              <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${t.badge}`}><KpiIcon name={tip.icon || "alert"} /></span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-slate-800">{tip.title}</div>
                <div className="text-[11px] text-slate-500 leading-snug">{tip.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </InsightPanel>
  );
}

// A small column chart (e.g. the last 7 days): [{ label, value }]; the
// highest column is highlighted like the "This week" chart of the reference.
export function MiniBars({ title, subtitle, data, unit = "", height = 96 }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const top = data.reduce((b, d, i) => ((d.value || 0) > (data[b]?.value || 0) ? i : b), 0);
  return (
    <InsightPanel title={title} subtitle={subtitle}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end" title={`${d.label}: ${(d.value || 0).toLocaleString("en-PH")}${unit}`}>
            {i === top && d.value > 0 && <span className="text-[10px] font-mono font-semibold text-cyan-700">{d.value.toLocaleString("en-PH")}</span>}
            <span className={`w-full rounded-md ${i === top && d.value > 0 ? "bg-cyan-500" : "bg-black/[0.08]"}`} style={{ height: `${Math.max(4, ((d.value || 0) / max) * (height - 30))}px` }} />
            <span className="text-[10px] text-slate-500 truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
    </InsightPanel>
  );
}

// A round progress ring with the value in the middle (0..1).
export function ProgressRing({ value, label, size = 76, tone = "cyan", caption }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = { cyan: "#06b6d4", emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", violet: "#8b5cf6" }[tone] || "#06b6d4";
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`} className="flex-shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(100,116,139,0.18)" strokeWidth="8" />
        <circle className="fx-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ "--fx-dash-from": c, "--fx-dash-to": c * (1 - pct) }} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="fill-slate-800 font-mono" style={{ fontSize: size / 4.6, fontWeight: 600 }}>{Math.round(pct * 100)}%</text>
      </svg>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-slate-800">{label}</div>
        {caption && <div className="text-[11px] text-slate-500 leading-snug">{caption}</div>}
      </div>
    </div>
  );
}
