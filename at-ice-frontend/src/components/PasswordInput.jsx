import { useHoldReveal } from "../lib/useHoldReveal";

// Show/hide for every password and PIN field in the app: the text shows only
// while the eye button is held down (mouse, finger, or Space/Enter on the
// keyboard) and hides again as soon as it is let go.

const EyeIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function RevealButton({ revealed, buttonProps, className = "" }) {
  return (
    <button
      {...buttonProps}
      className={`flex-shrink-0 w-10 h-10 flex items-center justify-center cursor-pointer select-none touch-none text-slate-400 hover:text-slate-600 ${className}`}
    >
      {revealed ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

// Drop-in for <input type="password">: same props, with the eye button inside
// the right end of the field.
export default function PasswordInput({ className = "", style, ...props }) {
  const [revealed, buttonProps] = useHoldReveal();
  return (
    <div className="relative w-full">
      <input
        {...props}
        type={revealed ? "text" : "password"}
        className={className}
        style={{ ...style, paddingRight: "2.75rem" }}
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-0.5">
        <RevealButton revealed={revealed} buttonProps={buttonProps} className="w-9 h-9" />
      </div>
    </div>
  );
}
