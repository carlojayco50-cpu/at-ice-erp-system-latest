import { PAGE_SIZES } from "../lib/usePagination";

const ChevLeft = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>;
const ChevRight = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>;

// Page numbers to show: all when 7 or fewer, otherwise always exactly 7
// slots of the same width (first, last, the current page with its
// neighbours, and … for the gaps), so the buttons never move under the
// mouse after a click (owner, 2026-10-20):
//   1 2 3 4 5 … N    1 … p-1 p p+1 … N    1 … N-4 N-3 N-2 N-1 N
function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", count];
  if (page >= count - 3) return [1, "…", count - 4, count - 3, count - 2, count - 1, count];
  return [1, "…", page - 1, page, page + 1, "…", count];
}

// The one pagination bar under every list table (lib/usePagination.js gives
// `pager`): "Showing 1–10 of 42", Rows per page (10, 25, 50), Previous, the
// page numbers (current one in indigo) and Next. fixed: the phone screens
// always show 10 per page, so Rows per page is left out.
export default function Pagination({ pager, label = "rows", fixed = false }) {
  if (!pager || pager.total === 0) return null;
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = pager;
  const btn = "pager-btn inline-flex items-center justify-center gap-1 h-9 rounded-lg border text-[12px] font-medium tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  // fixed widths: Previous, Next and every page slot keep their place
  const navBtn = `${btn} w-9 sm:w-[92px] px-0`;
  const numBtn = `${btn} w-10 px-0`;

  return (
    <nav aria-label="Pagination" className="pager flex flex-wrap items-center justify-between gap-3 px-[18px] py-3 border-t border-black/[0.06]">
      <div className="flex items-center gap-3 text-[12px] text-slate-500">
        <span>Showing <b className="text-slate-700">{from}–{to}</b> of <b className="text-slate-700">{total}</b> {label}</span>
        {!fixed && <label className="flex items-center gap-1.5">
          <span>Rows per page</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="pager-size h-9 px-2 rounded-lg border border-black/[0.09] bg-white text-[12px] text-slate-700 outline-none focus:border-indigo-400">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"
          className={`${navBtn} border-black/[0.09] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800`}>
          <ChevLeft /> <span className="hidden sm:inline">Previous</span>
        </button>
        {pageList(page, pageCount).map((p, i) => (p === "…" ? (
          <span key={`gap${i}`} className="inline-flex items-center justify-center w-10 h-9 text-slate-400 text-[12px]" aria-hidden="true">…</span>
        ) : (
          <button key={`slot${i}`} type="button" onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`}
            className={`${numBtn} ${p === page ? "pager-current border-indigo-500 bg-indigo-500 text-white" : "border-black/[0.09] bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}>
            {p}
          </button>
        )))}
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page"
          className={`${navBtn} border-black/[0.09] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800`}>
          <span className="hidden sm:inline">Next</span> <ChevRight />
        </button>
      </div>
    </nav>
  );
}
