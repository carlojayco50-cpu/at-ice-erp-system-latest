import { useEffect, useId } from "react";
import { Icon } from "./icons";
import { TONE_CLASS, toneFor, BTN, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER } from "../lib/mobileUi";

// Building blocks of the Maintenance, Checker and Salesman screens (the AT-ICE
// mobile contract; classes in lib/mobileUi.js): 44px touch targets, 16px
// fields, one-tap locking buttons, bottom sheets, one set of status colors.

// Icons come from the shared set in ./icons (one stroke, one size scale, one red warning).
export { Icon };

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
