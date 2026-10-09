import { typedDigits, PHONE_PREFIX } from "../lib/phone";

// Phone input with a fixed "+63" prefix. `value` holds only the digits after
// +63 (see lib/phone.js); `onChange` receives the cleaned digits.
// The prefix sits inside the field (one field, not two boxes side by side), so
// the field keeps the page's own style and the soft UI dent in both themes.
export default function PhoneInput({ value, onChange, className = "", invalid = false, placeholder = "9171234567", ...rest }) {
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 pl-3 text-[13px] font-medium text-slate-500 select-none"
      >
        {PHONE_PREFIX}
        <span className="h-4 w-px bg-slate-400/40" />
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(typedDigits(e.target.value))}
        placeholder={placeholder}
        className={`w-full ${className} ${invalid ? "border-red-300 focus:border-red-400" : ""}`}
        style={{ paddingLeft: "3.6rem" }}
        {...rest}
      />
    </div>
  );
}
