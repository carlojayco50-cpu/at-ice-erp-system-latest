import { PAGE_SIZES } from "../lib/usePagination";

const ChevLeft = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>;
const ChevRight = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>;

// Page numbers to show: all when 7 or fewer, otherwise the first, the last
// and two either side of the current page, with … between gaps.
function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out = [1];
  const start = Math.max(2, page - 2);
  const end = Math.min(count - 1, page + 2);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count - 1) out.push("…");
  out.push(count);
  return out;
}

// The one pagination bar under every list table (lib/usePagination.js gives
// `pager`): "Showing 1–10 of 42", Rows per page (10, 25, 50), Previous, the
// page numbers (current one in indigo) and Next.
export default function Pagination({ pager, label = "rows" }) {
  if (!pager || pager.total === 0) return null;
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = pager;
  const btn = "pager-btn inline-flex items-center justify-center gap-1 h-9 min-w-9 px-2.5 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <nav aria-label="Pagination" className="pager flex flex-wrap items-center justify-between gap-3 px-[18px] py-3 border-t border-black/[0.06]">
      <div className="flex items-center gap-3 text-[12px] text-slate-500">
        <span>Showing <b className="text-slate-700">{from}–{to}</b> of <b className="text-slate-700">{total}</b> {label}</span>
        <label className="flex items-center gap-1.5">
          <span>Rows per page</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="pager-size h-9 px-2 rounded-lg border border-black/[0.09] bg-white text-[12px] text-slate-700 outline-none focus:border-indigo-400">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"
          className={`${btn} border-black/[0.09] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800`}>
          <ChevLeft /> <span className="hidden sm:inline">Previous</span>
        </button>
        {pageList(page, pageCount).map((p, i) => (p === "…" ? (
          <span key={`gap${i}`} className="px-1 text-slate-400 text-[12px]" aria-hidden="true">…</span>
        ) : (
          <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`}
            className={`${btn} ${p === page ? "pager-current border-indigo-500 bg-indigo-500 text-white" : "border-black/[0.09] bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}>
            {p}
          </button>
        )))}
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page"
          className={`${btn} border-black/[0.09] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800`}>
          <span className="hidden sm:inline">Next</span> <ChevRight />
        </button>
      </div>
    </nav>
  );
}
