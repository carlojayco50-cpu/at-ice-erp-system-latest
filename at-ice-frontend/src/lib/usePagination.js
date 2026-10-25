import { useMemo, useState } from "react";

// Client-side paging for a list that is already loaded and filtered.
// const pager = usePagination(filtered);  rows = pager.pageItems;  <Pagination pager={pager} />
// The page resets to 1 when the list changes length (a new filter or search),
// and never points past the last page.
export const PAGE_SIZES = [10, 25, 50];

export function usePagination(items, { initialSize = 10 } = {}) {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const [pageSize, setPageSizeState] = useState(initialSize);
  const [state, setState] = useState({ page: 1, total: list.length });

  // a different number of rows (filter, search, new data): back to page 1
  let page = state.page;
  if (state.total !== list.length) {
    page = 1;
    setState({ page: 1, total: list.length });
  }

  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageItems = useMemo(() => list.slice((current - 1) * pageSize, current * pageSize), [list, current, pageSize]);

  return {
    page: current,
    pageSize,
    pageCount,
    total: list.length,
    from: list.length ? (current - 1) * pageSize + 1 : 0,
    to: Math.min(current * pageSize, list.length),
    pageItems,
    setPage: (p) => setState((s) => ({ ...s, page: Math.max(1, Math.min(pageCount, p)) })),
    setPageSize: (n) => { setPageSizeState(n); setState((s) => ({ ...s, page: 1 })); },
  };
}
