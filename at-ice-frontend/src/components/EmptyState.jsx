// "Nothing here yet" message with a small icon, used by every list in the
// app so empty pages look the same everywhere (phone screens included).
//   <EmptyState icon="truck">No deliveries found.</EmptyState>
const ICONS = {
  truck: <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  calendar: <path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />,
  wallet: <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z" />,
  search: <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />,
  receipt: <path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2zM8 7h8M8 11h8M8 15h4" />,
  box: <path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />,
  clipboard: <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 3h6v4H9z" />,
  snow: <path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9" />,
  store: <path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" />,
};

export default function EmptyState({ icon = "box", compact = false, children }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 py-4" : "gap-3 px-6 py-10"}`} role="status">
      <div className={`${compact ? "w-10 h-10" : "w-14 h-14"} rounded-full bg-slate-50 border border-black/[0.06] flex items-center justify-center text-slate-400`}>
        <svg width={compact ? 18 : 24} height={compact ? 18 : 24} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
          {ICONS[icon] || ICONS.box}
        </svg>
      </div>
      <div className={`${compact ? "text-[12px]" : "text-[13px]"} text-slate-500 max-w-[280px] leading-snug`}>{children}</div>
    </div>
  );
}
