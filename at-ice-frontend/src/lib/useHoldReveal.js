import { useState } from "react";

// Hold-to-show for password fields (see components/PasswordInput.jsx).
// [revealed, buttonProps]: spread buttonProps on the eye button.
export function useHoldReveal() {
  const [revealed, setRevealed] = useState(false);
  const show = () => setRevealed(true);
  const hide = () => setRevealed(false);
  const buttonProps = {
    type: "button",
    "aria-label": "Hold to show",
    "aria-pressed": revealed,
    title: "Hold to show",
    onPointerDown: (e) => { e.preventDefault(); show(); },
    onPointerUp: hide,
    onPointerLeave: hide,
    onPointerCancel: hide,
    onBlur: hide,
    onKeyDown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); show(); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") hide(); },
    onContextMenu: (e) => e.preventDefault(),
  };
  return [revealed, buttonProps];
}
