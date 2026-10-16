import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeToasts } from "../lib/toast";

const DURATION = 3000; // shown 3 seconds, the last 300ms fading out
const FADE = 300;
const MAX_SHOWN = 3;

const ICONS = {
  success: <polyline points="20 6 9 17 4 12" />,
  error: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  info: <><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
};

// Shows the notices sent with toast.success / toast.error (lib/toast.js) at the
// top center, in the soft UI style. Mounted once in App.jsx.
export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(
    () =>
      subscribeToasts((t) => {
        setItems((list) => [...list, t].slice(-MAX_SHOWN));
        setTimeout(() => setItems((list) => list.map((x) => (x.id === t.id ? { ...x, leaving: true } : x))), DURATION - FADE);
        setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), DURATION);
      }),
    []
  );

  if (items.length === 0) return null;
  // Night mode is set on the page layout, not on <body>
  const dark = !!document.querySelector(".cp-dark");

  return createPortal(
    <div className={`soft-toasts ${dark ? "neu-dark" : ""}`} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role={t.type === "error" ? "alert" : "status"} className={`soft-toast is-${t.type}${t.leaving ? " is-leaving" : ""}`}>
          <span className="soft-toast-icon" aria-hidden="true">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              {ICONS[t.type]}
            </svg>
          </span>
          <span>{t.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="soft-toast-close"
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
