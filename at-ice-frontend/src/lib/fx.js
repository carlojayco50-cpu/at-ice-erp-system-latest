// Bridge to the optional effects layer in src/ui-effects/.
//
// The app never imports that folder directly: it is looked up here with
// import.meta.glob, so deleting the folder leaves an empty result and every
// call below quietly does nothing. The pages then look exactly as designed,
// without the extra motion, and nothing breaks.
const found = import.meta.glob("../ui-effects/index.js", { eager: true });
const fx = found["../ui-effects/index.js"] || null;

// Called once at start-up (main.jsx).
export function installEffects() {
  fx?.install?.();
}

// A short celebration burst (e.g. after a major transaction succeeded).
// x, y: where it starts (defaults to the top center, where the toast shows).
export function celebrate(x, y) {
  fx?.celebrate?.(x, y);
}

// True when the effects layer is present and switched on.
export function effectsOn() {
  return Boolean(fx?.isOn?.());
}
