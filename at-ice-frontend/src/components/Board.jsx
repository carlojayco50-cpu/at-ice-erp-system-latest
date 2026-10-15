import { TONES } from "../lib/boardTones";

// Board building blocks for Admin pages, in the style of monday.com boards:
// a group has a colored title and a colored left edge on every row, and each
// status is a full-width colored cell that reads at a glance.
//
//   <BoardGroup title="On the road" tone="working" count={3} columns={[...]}>
//     <BoardRow tone="working" cells={[...]} />
//   </BoardGroup>
//   <StatusCell tone="done">Delivered</StatusCell>

export function StatusCell({ tone = "idle", children, className = "", title }) {
  return (
    <span
      title={title}
      className={`flex items-center justify-center min-h-[30px] px-2 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]?.cell || TONES.idle.cell} ${className}`}
    >
      {children}
    </span>
  );
}

// A board group: colored title line, then a table whose rows each carry the
// group color on their left edge. `columns` are { label, className } (the
// first one is the item name). Children are <BoardRow>s.
export function BoardGroup({ title, tone = "info", count, columns, children, footer, empty = "Nothing here." }) {
  const t = TONES[tone] || TONES.info;
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="min-w-0">
      <div className={`flex items-baseline gap-2 px-1 pb-1.5 text-[13px] font-semibold ${t.text}`}>
        <span>{title}</span>
        {count != null && <span className="text-[11px] font-normal text-slate-400">{count} {count === 1 ? "item" : "items"}</span>}
      </div>
      <div className="overflow-x-auto rounded-md border border-black/[0.09] bg-white">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              {columns.map((c, i) => (
                <th
                  key={c.label}
                  className={`font-medium px-3 py-2 border-b border-black/[0.06] ${i === 0 ? "!text-left" : "text-center"} ${c.className || ""}`}
                  style={i === 0 ? { boxShadow: `inset 4px 0 0 ${t.edge}` } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows : (
              <tr>
                <td colSpan={columns.length} className="px-3 py-3 text-[11px] text-slate-400" style={{ boxShadow: `inset 4px 0 0 ${t.edge}` }}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}

// One board row. The first cell is the item name (left, with the group's
// edge color); the others are centered. A cell may be a <StatusCell>, which
// fills it edge to edge.
export function BoardRow({ tone = "info", cells, onClick, title }) {
  const t = TONES[tone] || TONES.info;
  return (
    <tr
      onClick={onClick}
      title={title}
      className={`border-b border-black/[0.06] last:border-b-0 ${onClick ? "cursor-pointer hover:bg-slate-50" : ""}`}
    >
      {cells.map((cell, i) => {
        const fill = cell && typeof cell === "object" && (cell.type === StatusCell || cell.type?.boardFill);
        return (
          <td
            key={i}
            className={`${fill ? "p-0 border-l border-white" : "px-3 py-2"} ${i === 0 ? "!text-left text-slate-800 font-medium" : "text-center text-slate-600 tabular-nums"}`}
            style={i === 0 ? { boxShadow: `inset 4px 0 0 ${t.edge}` } : undefined}
          >
            {cell}
          </td>
        );
      })}
    </tr>
  );
}
