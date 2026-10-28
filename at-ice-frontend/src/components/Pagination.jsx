import { useLayoutEffect, useRef } from "react";
import { PAGE_SIZES } from "../lib/usePagination";
import { Icon } from "./icons";

const ChevLeft = () => <Icon name="chevronLeft" size={14} />;
const ChevRight = () => <Icon name="chevron" size={14} />;

// The one pagination bar under every list table (lib/usePagination.js gives
// `pager`): Previous, the current page over the total, and Next, centered.
// Rows per page sits under it unless fixed (phone screens always use 10).
//
// Stable height: the table box right above the bar keeps the height of a full
// page, so a short last page never pulls the bar up under the mouse. It starts
// over when the page size or the row count changes.
export default function Pagination({ pager, fixed = false }) {
  const navRef = useRef(null);
  const tallest = useRef({ key: "", height: 0 });
  useLayoutEffect(() => {
    const box = navRef.current?.previousElementSibling;
    if (!box || !pager || !box.querySelector("table")) return;
    const key = `${pager.pageSize}|${pager.total}`;
    if (tallest.current.key !== key) tallest.current = { key, height: 0 };
    box.style.minHeight = "";
    const height = box.offsetHeight;
    if (pager.page < pager.pageCount) tallest.current.height = Math.max(tallest.current.height, height);
    if (tallest.current.height > height) box.style.minHeight = `${tallest.current.height}px`;
  });
  if (!pager || pager.total === 0) return null;
  const { page, pageCount, pageSize, setPage, setPageSize } = pager;
  const pill = "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-2xl border border-black/[0.09] bg-white text-[12px] font-medium text-slate-600 transition-colors";

  return (
    <nav ref={navRef} aria-label="Pagination" className="pager flex flex-col items-center gap-2 w-full px-[18px] py-4 border-t border-black/[0.06]">
      <div className="flex justify-center items-center gap-3 w-full">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"
          className={`${pill} hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
          <ChevLeft /> Previous
        </button>
        <span className={`${pill} min-w-[80px] tabular-nums text-slate-500`} aria-current="page">
          <b className="text-slate-800">{page}</b>&nbsp;/&nbsp;{pageCount}
        </span>
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page"
          className={`${pill} hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
          Next <ChevRight />
        </button>
      </div>
      {!fixed && (
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>Rows per page</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="h-8 px-2 rounded-lg border border-black/[0.09] bg-white text-[12px] text-slate-700 outline-none focus:border-indigo-400">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </nav>
  );
}
