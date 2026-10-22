// The one switch for the motion and visual effects layer (src/ui-effects/).
//
//   true  -> animations, count-up numbers, sliding tab pills, celebration
//            bursts and the other effects are on.
//   false -> the app looks and works exactly as without this folder.
//
// Deleting the whole src/ui-effects/ folder has the same result as false:
// src/lib/fx.js only loads it when it is there.
export const ENABLE_UI_EFFECTS = true;

// Anyone who asked their device for less motion gets none, whatever the switch.
export const respectReducedMotion = true;
