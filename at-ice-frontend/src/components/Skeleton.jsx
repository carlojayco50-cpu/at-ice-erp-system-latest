// Loading placeholders shaped like the content they stand in for. The shimmer
// is the .skeleton class in index.css (it stops for reduced motion).

// Rows for a table body while it loads.
export function SkeletonTableRows({ cols = 4, rows = 4 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="px-[18px] py-3.5">
          <div className="skeleton h-3" style={{ width: `${c === 0 ? 70 : 40 + ((r + c) % 3) * 15}%` }} />
        </td>
      ))}
    </tr>
  ));
}

// Stacked rows (title line + detail line) for lists and cards. card wraps it
// in the standard card surface, for pages that show nothing else while loading.
export function SkeletonList({ rows = 3, card = false, className = "" }) {
  const box = card ? "bg-white border border-black/[0.09] rounded-xl p-5" : "py-2";
  return (
    <div role="status" aria-label="Loading" className={`flex flex-col gap-3 ${box} ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-1">
          <div className="skeleton h-3.5" style={{ width: `${55 + (i % 3) * 12}%` }} />
          <div className="skeleton h-3" style={{ width: `${35 + (i % 2) * 20}%` }} />
        </div>
      ))}
    </div>
  );
}
