// Ambient glow behind dialogs (styles in glow.css).
//
// Dialogs are plain Tailwind overlays and portals, with no shared modal
// component, so this watches the page instead: every open dialog panel gets
// data-glow, "active" for the topmost one and "idle" for the ones under it.
// Only the active panel runs the breathing pulse; it stops when the panel is
// covered or removed, and never runs for people who ask for reduced motion.

const PANEL = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.fixed.inset-0 > :is(div, form, aside)[class*="bg-white"]',
].join(", ");

const PULSE_MS = 3200;
const pulses = new WeakMap();

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function startPulse(el) {
  if (pulses.has(el) || reduced() || !el.animate) return;
  const run = [
    // fade the glow in once, then breathe
    el.animate([{ "--glow-open": 0 }, { "--glow-open": 1 }], { duration: 500, easing: "ease-out", fill: "forwards" }),
    el.animate([{ "--glow-pulse": 0 }, { "--glow-pulse": 1 }], { duration: PULSE_MS, easing: "ease-in-out", iterations: Infinity, direction: "alternate" }),
  ];
  pulses.set(el, run);
}

function stopPulse(el) {
  pulses.get(el)?.forEach((a) => a.cancel());
  pulses.delete(el);
}

let queued = false;
function update() {
  queued = false;
  const panels = [...new Set(document.querySelectorAll(PANEL))].filter((el) => el.isConnected && !el.closest("[hidden]"));
  const top = panels[panels.length - 1];
  document.querySelectorAll("[data-glow]").forEach((el) => {
    if (!panels.includes(el)) {
      stopPulse(el);
      el.removeAttribute("data-glow");
    }
  });
  panels.forEach((el) => {
    const state = el === top ? "active" : "idle";
    if (el.dataset.glow !== state) el.dataset.glow = state;
    if (state === "active") startPulse(el);
    else stopPulse(el);
  });
}

export function installModalGlow() {
  const queue = () => {
    if (queued) return;
    queued = true;
    setTimeout(update, 16);
  };
  // childList only: setting data-glow is an attribute change, so it cannot loop
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
}
