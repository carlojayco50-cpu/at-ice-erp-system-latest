// Click feedback for every button in the app. A quick click is over before the
// :active style can show, so the clicked button gets [data-pressed] for a short
// moment; the CSS (index.css, neumorphism.css) draws it pressed in while it is on.
// Works for mouse, touch and the keyboard (Enter / Space).

const HOLD_MS = 220;

function press(btn) {
  if (!btn || btn.disabled) return;
  clearTimeout(btn._pressTimer);
  btn.setAttribute("data-pressed", "");
}

function release(btn) {
  if (!btn) return;
  clearTimeout(btn._pressTimer);
  btn._pressTimer = setTimeout(() => btn.removeAttribute("data-pressed"), HOLD_MS);
}

const buttonOf = (target) => (target instanceof Element ? target.closest("button, [role='button']") : null);

export function installPressFeedback() {
  if (typeof document === "undefined" || document._pressFeedback) return;
  document._pressFeedback = true;

  let current = null;
  document.addEventListener("pointerdown", (e) => {
    current = buttonOf(e.target);
    press(current);
  }, true);
  const up = () => { release(current); current = null; };
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);

  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !e.repeat) press(buttonOf(e.target));
  }, true);
  document.addEventListener("keyup", (e) => {
    if (e.key === "Enter" || e.key === " ") release(buttonOf(e.target));
  }, true);
}
