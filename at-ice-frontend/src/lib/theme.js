// Theme state and colors shared by every layout. Components that use them
// (NightStyle, NightToggle, NightScope) are in components/NightMode.jsx.
import { useCallback, useEffect, useState } from "react";
import iceImage from "../assets/iceproduct.png";

export const THEME_KEY = "atice-theme";

export const DARK_CSS = String.raw`
.cp-dark { color-scheme: dark; }

/* Surfaces */
.cp-dark .bg-white { background-color: #111827 !important; }
.cp-dark .bg-white\/95,
.cp-dark .bg-white\/90 { background-color: rgba(17,24,39,0.95) !important; }
.cp-dark .bg-white\/80 { background-color: rgba(15,23,42,0.8) !important; }
.cp-dark .bg-slate-50 { background-color: #1a2332 !important; }
.cp-dark .bg-slate-100 { background-color: #1f2a3b !important; }
.cp-dark .bg-slate-200 { background-color: #273449 !important; }
.cp-dark .hover\:bg-slate-50:hover,
.cp-dark .active\:bg-slate-50:active { background-color: #1a2332 !important; }
.cp-dark .hover\:bg-slate-100:hover,
.cp-dark .active\:bg-slate-100:active { background-color: #1f2a3b !important; }
.cp-dark .bg-slate-300 { background-color: #334155 !important; }
.cp-dark .active\:bg-slate-200:active,
.cp-dark .hover\:bg-slate-200:hover { background-color: #273449 !important; }

/* Table headers and row hover */
.cp-dark .bg-slate-50\/80 { background-color: rgba(26,35,50,0.90) !important; }
.cp-dark .hover\:bg-slate-50\/60:hover,
.cp-dark .hover\:bg-black\/\[0\.04\]:hover { background-color: rgba(255,255,255,0.04) !important; }

/* Disabled and focused form fields keep the dark field color */
.cp-dark .focus\:bg-white:focus { background-color: #0f172a !important; }
.cp-dark .disabled\:bg-slate-50:disabled,
.cp-dark .disabled\:bg-slate-100:disabled { background-color: #1a2332 !important; }

/* Text */
.cp-dark .text-slate-900 { color: #f8fafc !important; }
.cp-dark .text-slate-800 { color: #f1f5f9 !important; }
.cp-dark .text-slate-700 { color: #e2e8f0 !important; }
.cp-dark .text-slate-600 { color: #cbd5e1 !important; }
/* Muted text: slate-500 and slate-400 stay at 4.5:1 or more (WCAG AA) on
   every dark surface, including bg-slate-200 (#273449). */
.cp-dark .text-slate-500 { color: #aeb9ca !important; }
.cp-dark .text-slate-400,
.cp-dark .disabled\:text-slate-400:disabled { color: #94a3b8 !important; }
.cp-dark .text-slate-300 { color: #7d8ba1 !important; }
.cp-dark .hover\:text-slate-800:hover,
.cp-dark .hover\:text-slate-700:hover,
.cp-dark .hover\:text-slate-600:hover,
.cp-dark .active\:text-slate-600:active { color: #f1f5f9 !important; }

/* Borders and dividers */
.cp-dark .border-black\/\[0\.12\],
.cp-dark .border-slate-300,
.cp-dark .border-slate-400,
.cp-dark .hover\:border-black\/20:hover { border-color: rgba(255,255,255,0.16) !important; }
.cp-dark .border-black\/\[0\.1\],
.cp-dark .border-black\/\[0\.10\],
.cp-dark .border-black\/\[0\.09\],
.cp-dark .border-black\/\[0\.08\] { border-color: rgba(255,255,255,0.10) !important; }
.cp-dark .border-black\/\[0\.07\],
.cp-dark .border-black\/\[0\.06\] { border-color: rgba(255,255,255,0.07) !important; }
.cp-dark .divide-black\/\[0\.06\] > * { border-color: rgba(255,255,255,0.07) !important; }
.cp-dark .border-slate-100,
.cp-dark .border-slate-200 { border-color: rgba(255,255,255,0.10) !important; }
.cp-dark .divide-slate-100 > * { border-color: rgba(255,255,255,0.07) !important; }

/* Accent text */
.cp-dark .text-cyan-500,
.cp-dark .text-cyan-600 { color: #22d3ee !important; }
.cp-dark .text-cyan-700,
.cp-dark .text-cyan-800 { color: #67e8f9 !important; }
.cp-dark .text-emerald-600 { color: #34d399 !important; }
.cp-dark .text-emerald-700,
.cp-dark .text-green-700 { color: #6ee7b7 !important; }
.cp-dark .text-orange-600 { color: #fb923c !important; }
.cp-dark .text-blue-700 { color: #93c5fd !important; }
.cp-dark .hover\:text-cyan-600:hover,
.cp-dark .hover\:text-cyan-700:hover { color: #67e8f9 !important; }
.cp-dark .hover\:text-red-600:hover { color: #fca5a5 !important; }
.cp-dark .text-green-500,
.cp-dark .text-green-600 { color: #4ade80 !important; }
.cp-dark .text-amber-500,
.cp-dark .text-amber-600 { color: #fbbf24 !important; }
.cp-dark .text-amber-700 { color: #fcd34d !important; }
.cp-dark .text-red-500,
.cp-dark .text-red-600 { color: #f87171 !important; }
.cp-dark .text-red-700 { color: #fca5a5 !important; }
.cp-dark .text-blue-500,
.cp-dark .text-blue-600 { color: #60a5fa !important; }
.cp-dark .text-violet-600,
.cp-dark .text-purple-600 { color: #a78bfa !important; }

/* Tinted backgrounds (status badges, notice boxes) */
.cp-dark .bg-emerald-50 { background-color: rgba(16,185,129,0.10) !important; }
.cp-dark .bg-emerald-100 { background-color: rgba(16,185,129,0.18) !important; }
.cp-dark .bg-green-50 { background-color: rgba(34,197,94,0.10) !important; }
.cp-dark .bg-green-100 { background-color: rgba(34,197,94,0.18) !important; }
.cp-dark .bg-amber-50 { background-color: rgba(245,158,11,0.10) !important; }
.cp-dark .bg-amber-100 { background-color: rgba(245,158,11,0.18) !important; }
.cp-dark .bg-red-50 { background-color: rgba(239,68,68,0.10) !important; }
.cp-dark .bg-red-100 { background-color: rgba(239,68,68,0.18) !important; }
.cp-dark .bg-cyan-50 { background-color: rgba(6,182,212,0.10) !important; }
.cp-dark .bg-cyan-100 { background-color: rgba(6,182,212,0.18) !important; }
.cp-dark .bg-blue-50 { background-color: rgba(59,130,246,0.10) !important; }
.cp-dark .bg-blue-100 { background-color: rgba(59,130,246,0.18) !important; }
.cp-dark .bg-violet-50,
.cp-dark .bg-purple-50 { background-color: rgba(139,92,246,0.10) !important; }
.cp-dark .bg-violet-100,
.cp-dark .bg-purple-100 { background-color: rgba(139,92,246,0.18) !important; }
.cp-dark .bg-orange-50 { background-color: rgba(249,115,22,0.10) !important; }
.cp-dark .bg-red-50\/40,
.cp-dark .bg-red-50\/60 { background-color: rgba(239,68,68,0.08) !important; }
.cp-dark .hover\:bg-orange-50:hover { background-color: rgba(249,115,22,0.14) !important; }
.cp-dark .active\:bg-cyan-50:active { background-color: rgba(6,182,212,0.14) !important; }
.cp-dark .hover\:bg-emerald-50:hover { background-color: rgba(16,185,129,0.14) !important; }
.cp-dark .hover\:bg-red-50:hover { background-color: rgba(239,68,68,0.14) !important; }
.cp-dark .hover\:bg-cyan-50:hover { background-color: rgba(6,182,212,0.14) !important; }

/* Tinted borders */
.cp-dark .border-emerald-200,
.cp-dark .border-emerald-300 { border-color: rgba(52,211,153,0.35) !important; }
.cp-dark .border-amber-100 { border-color: rgba(251,191,36,0.30) !important; }
.cp-dark .border-cyan-100 { border-color: rgba(34,211,238,0.30) !important; }
.cp-dark .border-red-300 { border-color: rgba(248,113,113,0.45) !important; }
.cp-dark .border-orange-200,
.cp-dark .border-orange-300 { border-color: rgba(251,146,60,0.40) !important; }
.cp-dark .border-green-100,
.cp-dark .border-green-200 { border-color: rgba(74,222,128,0.30) !important; }
.cp-dark .border-amber-200 { border-color: rgba(251,191,36,0.35) !important; }
.cp-dark .border-red-100,
.cp-dark .border-red-200 { border-color: rgba(248,113,113,0.35) !important; }
.cp-dark .border-cyan-200 { border-color: rgba(34,211,238,0.35) !important; }
.cp-dark .border-blue-100,
.cp-dark .border-blue-200 { border-color: rgba(96,165,250,0.30) !important; }
.cp-dark .hover\:border-red-300:hover { border-color: rgba(248,113,113,0.55) !important; }

/* Form fields */
.cp-dark input,
.cp-dark select,
.cp-dark textarea { background-color: #0f172a; color: #e2e8f0; }
.cp-dark input::placeholder,
.cp-dark textarea::placeholder { color: #7d8ba1 !important; }
.cp-dark input:disabled,
.cp-dark select:disabled,
.cp-dark textarea:disabled { color: #94a3b8; }
.cp-dark option { background-color: #0f172a; color: #e2e8f0; }
`;

// Remembers the choice on this device (shared by all staff modules).
// Switching the theme fades colors over 300ms. The .theme-switching class
// (see index.css) is only on <html> during the switch, so it never slows down
// the hover and press transitions the rest of the time.
let switchTimer;
function fadeThemeSwitch() {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  clearTimeout(switchTimer);
  switchTimer = setTimeout(() => root.classList.remove("theme-switching"), 350);
}

// Until someone presses the Night/Light button on this device, the theme
// follows the device's own light or dark setting, and changes with it
// (owner, 2026-10-20). The button's choice is then remembered.
const deviceDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
function savedTheme(storageKey) {
  try { return localStorage.getItem(storageKey); } catch { return null; }
}

export function useNightMode(storageKey = THEME_KEY) {
  const [dark, setDark] = useState(() => {
    const saved = savedTheme(storageKey);
    return saved ? saved === "dark" : deviceDark();
  });
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const follow = (e) => {
      if (savedTheme(storageKey)) return;
      fadeThemeSwitch();
      setDark(e.matches);
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [storageKey]);
  const switchTheme = useCallback((value) => {
    fadeThemeSwitch();
    setDark((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try { localStorage.setItem(storageKey, next ? "dark" : "light"); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  return [dark, switchTheme];
}

// Tint laid over the ice photo behind the page content. Light enough that the
// ice texture stays visible in both themes (slate-50 at 80%, slate-950 at 85%).
export const nightOverlay = (dark) => (dark ? "rgba(2,6,23,0.85)" : "rgba(248,250,252,0.80)");

// Ice photo background with the theme tint. The tint is an inset shadow, not a
// gradient, so it can fade between themes like the other colors.
export const ambientStyle = (dark) => ({
  backgroundImage: `url(${iceImage})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundAttachment: "fixed",
  boxShadow: `inset 0 0 0 9999px ${nightOverlay(dark)}`,
});

