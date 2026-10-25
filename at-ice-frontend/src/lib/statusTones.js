// One soft pill per meaning, on every page (owner, 2026-10-22): a 50 tint,
// 700 text and a 200 border. Every other status map (board, deliveries,
// invoices, role screens) takes its classes from here. Night versions come
// from the .cp-dark rules in index.css and lib/theme.js, so these classes read
// the same in light and night mode. Each meaning keeps its own hue:
// waiting amber, queued violet, in progress deep cyan, done emerald,
// cancelled / idle slate, off / rejected / overdue rose.
export const PILL = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  progress: "bg-cyan-50 text-cyan-800 border border-cyan-200",
  queued: "bg-violet-50 text-violet-700 border border-violet-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  danger: "bg-rose-50 text-rose-700 border border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border border-slate-200",
};
