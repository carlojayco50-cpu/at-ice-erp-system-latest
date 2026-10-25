import { useEffect, useId } from "react";
import { TONE_CLASS, toneFor, BTN, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER } from "../lib/mobileUi";

// Building blocks of the Maintenance, Checker and Salesman screens (the AT-ICE
// mobile contract; classes in lib/mobileUi.js): 44px touch targets, 16px
// fields, one-tap locking buttons, bottom sheets, one set of status colors.

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 1 0-5.66 5.66L2 19l3 3 7.03-7.04a4 4 0 0 0 5.67-5.66l-2.83 2.83-2.12-2.12 2.83-2.83z" />,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  truck: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  swap: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  chevron: <polyline points="9 18 15 12 9 6" />,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  print: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
};

export function Icon({ name, size = 18, className = "" }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {PATHS[name] || null}
    </svg>
  );
}

// Status badge: give `status` (a record status) or `tone` (pending, progress, done, urgent).
export function StatusBadge({ status, tone, children, className = "" }) {
  const t = tone || toneFor(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${TONE_CLASS[t]} ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = "" }) {
  return <span className={`inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} aria-hidden="true" />;
}

// A button that locks itself while its action runs (spinner + disabled), so a
// slow connection cannot send the same thing twice.
export function LoadingButton({ loading = false, variant = "primary", className = "", children, disabled, type = "button", ...rest }) {
  const base = variant === "secondary" ? BTN_SECONDARY : variant === "danger" ? BTN_DANGER : variant === "plain" ? BTN : BTN_PRIMARY;
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`${base} ${className}`} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

// Slide-up drawer for filters, confirmations and quick forms (no center
// modals on the role screens). Closes on the backdrop and on Escape.
export function BottomSheet({ open, onClose, title, children, footer }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button type="button" aria-label="Close" onClick={onClose} className="sheet-backdrop absolute inset-0 w-full h-full bg-slate-900/50 cursor-default" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="role-sheet fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-4 shadow-2xl max-h-[88dvh] overflow-y-auto max-w-md mx-auto">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        <div className="flex flex-nowrap items-start justify-between gap-2 mb-3">
          <h2 id={titleId} className="min-w-0 flex-1 pt-2 text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-500 active:scale-[0.98] transition-transform">
            <Icon name="x" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-4 grid gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Big - / + buttons with a number field between them, for counting sacks and
// bags with wet or busy hands.
export function Stepper({ value, onChange, min = 0, max = 100000, label, id, disabled = false }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const n = Number(value) || 0;
  const set = (v) => onChange(String(Math.max(min, Math.min(max, v))));
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => set(n - 1)} disabled={disabled || n <= min} aria-label={`Less ${label || ""}`.trim()}
        className="h-11 w-11 min-h-[44px] min-w-[44px] flex-shrink-0 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none">
        <Icon name="minus" size={20} />
      </button>
      <input id={fieldId} type="text" inputMode="numeric" pattern="[0-9]*" aria-label={label} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="min-h-[44px] w-full min-w-0 text-center text-base font-semibold tabular-nums border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:border-cyan-500" />
      <button type="button" onClick={() => set(n + 1)} disabled={disabled || n >= max} aria-label={`More ${label || ""}`.trim()}
        className="h-11 w-11 min-h-[44px] min-w-[44px] flex-shrink-0 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none">
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}

// The page's main action, kept above the bottom nav.
export function ActionBar({ children }) {
  return (
    <div className="role-actionbar fixed inset-x-0 bottom-16 z-40 bg-white border-t border-slate-200 px-4 py-3">
      <div className="max-w-md mx-auto md:max-w-none grid gap-2">{children}</div>
    </div>
  );
}

export function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[14px] text-rose-700">
      <Icon name="alert" className="mt-0.5 flex-shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-[44px] px-3 -my-2 rounded-xl font-semibold active:scale-[0.98] transition-transform">Retry</button>}
    </div>
  );
}

export function SuccessBanner({ children }) {
  if (!children) return null;
  return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[14px] text-emerald-700">{children}</div>;
}

// Empty list: an icon and one clear line.
export function EmptyCard({ icon = "clipboard", title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center" role="status">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
        <Icon name={icon} size={22} />
      </div>
      {title && <div className="text-[15px] font-semibold text-slate-800">{title}</div>}
      <div className="text-[14px] text-slate-500 mt-1">{children}</div>
    </div>
  );
}

// Card-shaped loading placeholders.
export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

// A large tap area to take or pick a photo (proof, damage).
export function PhotoPicker({ id, file, previewUrl, onChange, label = "Take or choose a photo", required = false }) {
  return (
    <label htmlFor={id} className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-[15px] font-semibold text-slate-600 active:scale-[0.98] transition-transform">
      {previewUrl ? (
        <img src={previewUrl} alt="Selected" className="max-h-48 w-full rounded-lg object-cover" />
      ) : (
        <><Icon name="camera" /> {file ? file.name : label}{required ? " *" : ""}</>
      )}
      <input id={id} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}
