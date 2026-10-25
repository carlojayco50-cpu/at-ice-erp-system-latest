// One dropdown for every list filter in the app (owner, 2026-10-21: filters
// are dropdowns, never rows of pill buttons): a short label and a native
// <select>, so it gets the same soft popup (components/SoftPickers.jsx) and
// pressed-in field look as every other dropdown. A count shows after the
// option's name: "Pending (3)".
//
//   <FilterSelect label="Status" value={filter} onChange={setFilter}
//     options={[{ value: "all", label: "All", count: 12 }, ...]} />
//
// Option values may be strings, numbers or null; onChange gets the original value.
export default function FilterSelect({ label = "Show", value, onChange, options, className = "", hideLabel = false }) {
  const key = (v) => (v == null ? "" : String(v));
  return (
    <label className={`inline-flex items-center gap-2 text-[12px] text-slate-500 ${className}`}>
      <span className={hideLabel ? "sr-only" : "font-medium whitespace-nowrap"}>{label}</span>
      <select
        value={key(value)}
        onChange={(e) => onChange(options.find((o) => key(o.value) === e.target.value)?.value)}
        className="min-w-[160px] max-w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60 cursor-pointer"
      >
        {options.map((o) => (
          <option key={key(o.value)} value={key(o.value)}>
            {o.count != null ? `${o.label} (${o.count})` : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
