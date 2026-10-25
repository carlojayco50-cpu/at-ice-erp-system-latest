// Motion and visual effects layer, laid over the ice / neumorphism design.
// Everything it does is extra: with ENABLE_UI_EFFECTS = false (effectsConfig.js)
// or with this folder deleted, the app looks and works exactly as designed.
//
// What it adds (all scoped to html[data-fx="on"], see effects.css):
//  - cards, rows and sections fade and slide up in a short stagger
//  - KPI numbers count up ([data-fx-count]) and bars fill with a moving wave
//  - tab and segmented groups ([data-fx-tabs]) get a sliding active pill
//  - tips widgets ([data-fx-cycle]) show one tip at a time and fade between them
//  - dialogs scale in, chosen dates and options pop, busy buttons spin
//  - a removed row or card slides out after a remove / cancel / reject
//  - a celebration burst after a major success (paid, approved, delivered...)
import "./effects.css";
import { ENABLE_UI_EFFECTS, respectReducedMotion } from "./effectsConfig";
import { startCountUp } from "./countUp";
import { startTabIndicators } from "./tabIndicator";
import { startCycles } from "./cycle";
import { startLeaveAnimations } from "./leave";
import { celebrate as burst, startCelebrations } from "./celebrate";

let on = false;

export function isOn() {
  return on;
}

export function install() {
  if (on || typeof window === "undefined") return;
  if (!ENABLE_UI_EFFECTS) return;
  if (respectReducedMotion && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  on = true;
  document.documentElement.dataset.fx = "on";
  startCountUp();
  startTabIndicators();
  startCycles();
  startLeaveAnimations();
  startCelebrations();
}

export function celebrate(x, y) {
  if (on) burst(x, y);
}
