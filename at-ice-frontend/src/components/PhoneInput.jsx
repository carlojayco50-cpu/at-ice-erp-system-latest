import { typedDigits, PHONE_PREFIX, PHONE_MAX_DIGITS } from "../lib/phone";

// Phone input with a fixed "+63" prefix. `value` holds only the digits after
// +63 (see lib/phone.js); `onChange` receives the cleaned digits.
// The prefix sits inside the field (one field, not two boxes side by side), so
// the field keeps the page's own style and the soft UI dent in both themes.
// Its look and the groove after it are in controls.css (.phone-prefix).
// Typed or pasted digits are cut off at `maxDigits` (10, the longest valid number).
export default function PhoneInput({ value, onChange, className = "", invalid = false, placeholder = "9171234567", maxDigits = PHONE_MAX_DIGITS, ...rest }) {
  return (
    <div className="phone-field">
      <span aria-hidden="true" className="phone-prefix">{PHONE_PREFIX}</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(typedDigits(e.target.value).slice(0, maxDigits))}
        placeholder={placeholder}
        className={`w-full ${className} ${invalid ? "border-red-300 focus:border-red-400" : ""}`}
        {...rest}
      />
    </div>
  );
}
