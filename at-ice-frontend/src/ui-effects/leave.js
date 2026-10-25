// A removed row or card slides out instead of vanishing. It only runs right
// after a remove / delete / cancel / reject / archive notice (lib/toast.js), so
// lists that refresh on their own never flicker. The removed element is put
// back as a lifeless copy for a moment, collapses and is taken away again;
// React's own nodes are not touched.
import { subscribeToasts } from "../lib/toast";

const WINDOW_MS = 1500;
const LEAVE_MS = 320;
const WORDS = /remov|delet|cancel|reject|archiv|deactivat|discard/i;
let armedUntil = 0;

function ghost(node, parent, before) {
  if (!(node instanceof HTMLElement) || !parent.isConnected) return;
  if (!node.matches("tr, li, [class*='rounded']")) return;
  const copy = node.cloneNode(true);
  copy.classList.add("fx-leaving");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  try {
    parent.insertBefore(copy, before && before.parentNode === parent ? before : null);
  } catch {
    return;
  }
  setTimeout(() => copy.remove(), LEAVE_MS);
}

export function startLeaveAnimations() {
  subscribeToasts((t) => {
    if (WORDS.test(t.text || "")) armedUntil = Date.now() + WINDOW_MS;
  });
  const main = () => document.querySelector(".ice-main, .ice-scope, .role-shell") || document.body;
  new MutationObserver((records) => {
    if (Date.now() > armedUntil) return;
    for (const r of records) {
      if (!r.removedNodes.length || !main().contains(r.target)) continue;
      // one item leaving a list that keeps others (not a whole list being replaced)
      if (r.removedNodes.length === 1 && r.target.children.length > 0) ghost(r.removedNodes[0], r.target, r.nextSibling);
    }
  }).observe(document.body, { subtree: true, childList: true });
}
