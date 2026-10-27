import { useReveal } from "../lib/useReveal";
import { Icon } from "./icons";

// Show/hide for every password and PIN field in the app: clicking the eye
// button shows the text, clicking it again hides it.

const EyeIcon = () => (
  <Icon name="eye" size={18} strokeWidth={1.8} />
);
const EyeOffIcon = () => (
  <Icon name="eyeOff" size={18} strokeWidth={1.8} />
);

export function RevealButton({ revealed, buttonProps, className = "" }) {
  return (
    <button
      {...buttonProps}
      className={`flex-shrink-0 w-10 h-10 flex items-center justify-center cursor-pointer select-none text-slate-400 hover:text-slate-600 ${className}`}
    >
      {revealed ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

// Drop-in for <input type="password">: same props, with the eye button inside
// the right end of the field.
export default function PasswordInput({ className = "", style, ...props }) {
  const [revealed, buttonProps] = useReveal();
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
