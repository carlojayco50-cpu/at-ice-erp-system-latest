// A filter or table item pulses only the Hero card it is connected to.
// The card is found by its data-hero key (the same key the page uses for its
// filter), so nothing is guessed: no key, no pulse. The pulse is a border and
// tint change in a CSS overlay (index.css), not a glow, and it lasts one second.

export const HERO_PULSE_MS = 1000;

export function pulseHeroCard(key) {
  if (key == null) return;
  const el = document.querySelector(`main [data-hero="${CSS.escape(String(key))}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.removeAttribute("data-hero-pulse");
  void el.offsetWidth; // restart the animation on a repeat click
  el.setAttribute("data-hero-pulse", "");
  window.clearTimeout(el._heroTimer);
  el._heroTimer = window.setTimeout(() => el.removeAttribute("data-hero-pulse"), HERO_PULSE_MS);
}

// One listener for the whole app: when a filter dropdown on a page changes, the
// Hero card whose data-hero key equals the new value pulses. A card with no
// such key (or a dropdown with no matching card) does nothing.
let installed = false;
export function installHeroPulse() {
  if (installed) return;
  installed = true;
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLSelectElement && t.closest("main")) pulseHeroCard(t.value);
  });
}
