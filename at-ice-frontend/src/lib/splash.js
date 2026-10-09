// Plays the intro splash (SplashScreen, mounted once in App.jsx) on demand:
// after signing in, signing out and unlocking the kiosk. It lasts 2.2s every
// time (pace is kept for callers but no longer changes the length).
export const SPLASH_EVENT = "atice:splash";

export function playSplash(pace = 1) {
  window.dispatchEvent(new CustomEvent(SPLASH_EVENT, { detail: { pace } }));
}
