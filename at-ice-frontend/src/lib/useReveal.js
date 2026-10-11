import { useState } from "react";

// Show/hide toggle for password fields (see components/PasswordInput.jsx).
// [revealed, buttonProps]: spread buttonProps on the eye button.
export function useReveal() {
  const [revealed, setRevealed] = useState(false);
  const buttonProps = {
    type: "button",
    "aria-label": revealed ? "Hide password" : "Show password",
    "aria-pressed": revealed,
    title: revealed ? "Hide password" : "Show password",
    // keeps focus (and the caret) in the password field
    onMouseDown: (e) => e.preventDefault(),
    onClick: () => setRevealed((r) => !r),
  };
  return [revealed, buttonProps];
}
