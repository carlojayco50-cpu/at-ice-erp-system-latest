// Where a card click lands, and the glow that shows it.
//
// A card either filters the page it is on (its own onClick) or opens another
// page (the `to` prop). Both end the same way: the list the card stands for is
// scrolled into view and pulses cyan for a moment. A page can name that list
// with data-dest="..."; otherwise it is the first table on the page.
//
// Cross-page: navigate(to, { state: { dest: true } }) (or a data-dest id).
// DestinationWatcher (in App) sees the state on arrival, waits for the list to
// render, then scrolls and pulses. The state is cleared from the history entry
// so a refresh or the back button does not replay it.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PULSE_MS = 450; // the lift is 400 ms; the attribute goes once it has ended

// The element that holds the records for a card: data-dest by id, or the card
// around the page's first table.
export function findDestination(id) {
  if (id && id !== true) {
    const named = document.querySelector(`[data-dest="${CSS.escape(String(id))}"]`);
    if (named) return named;
  }
  const marked = document.querySelector("main [data-dest]");
  if (marked) return marked;
  const table = document.querySelector("main table");
  return table ? table.closest(".rounded-xl, .insight-panel") || table : null;
}

// Run fn once the element is in view. If it is already in view, fn runs now;
// otherwise the page scrolls and fn runs when the scroll ends (or after 900 ms
// if no scroll event comes), so the animation never plays while the element
// is still sliding through the viewport.
export function runWhenInView(el, fn) {
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return fn();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    window.removeEventListener("scrollend", go);
    window.clearTimeout(backstop);
    fn();
  };
  const backstop = window.setTimeout(go, 900);
  window.addEventListener("scrollend", go);
}

// Pulse the element once. Calling it again restarts the pulse.
export function pulseDestination(el) {
  if (!el) return;
  runWhenInView(el, () => {
    el.removeAttribute("data-dest-pulse");
    void el.offsetWidth; // restart the animation
    el.setAttribute("data-dest-pulse", "");
    window.clearTimeout(el._destTimer);
    el._destTimer = window.setTimeout(() => el.removeAttribute("data-dest-pulse"), PULSE_MS);
  });
}

// Same page: the filter's list is committed by React before the next frame,
// so pulse on that frame instead of after a fixed delay.
export function focusDestination(id) {
  requestAnimationFrame(() => pulseDestination(findDestination(id)));
}

// Other page: wait (up to 5 seconds) for the list to exist and have rows.
function waitForDestination(id, done) {
  const ready = () => {
    const el = findDestination(id);
    return el && !el.querySelector(".animate-pulse, [data-skeleton]") ? el : null;
  };
  const now = ready();
  if (now) return done(now), () => {};
  const watch = new MutationObserver(() => {
    const el = ready();
    if (el) { cleanup(); done(el); }
  });
  const cleanup = () => { watch.disconnect(); window.clearTimeout(giveUp); };
  const giveUp = window.setTimeout(cleanup, 5000);
  watch.observe(document.body, { childList: true, subtree: true });
  return cleanup;
}

export function DestinationWatcher() {
  const location = useLocation();
  const dest = location.state?.dest;

  useEffect(() => {
    if (!dest) return;
    waitForDestination(dest, pulseDestination);
    // drop the state from the history entry so a reload or back does not replay it
    const h = window.history.state;
    if (h?.usr) window.history.replaceState({ ...h, usr: null }, "");
  }, [dest, location.key]);

  return null;
}
