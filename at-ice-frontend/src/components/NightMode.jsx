import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DARK_CSS, ambientStyle, useNightMode } from "../lib/theme";
import { refreshAll } from "../lib/live";
import LiveClock from "./LiveClock";

export function NightStyle() {
  return <style>{DARK_CSS}</style>;
}

const MoonIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const SunIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;

// Topbar toggle (Admin, HR and Customer layouts, and the phone screens'
// clock row, where the label always shows)
export function NightToggle({ dark, onToggle, alwaysLabel = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={dark ? "Switch to light mode" : "Switch to night mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to night mode"}
      className="topbar-chip inline-flex items-center justify-center gap-1.5 h-10 px-3 bg-white border border-black/[0.09] rounded-lg text-xs font-medium leading-none text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      <span className={alwaysLabel ? "" : "hidden sm:inline"}>{dark ? "Light" : "Night"}</span>
    </button>
  );
}

const ScopeContext = createContext(null);

// The live clock (left) and the Night/Light button (right) of the phone
// screens. A page puts it in its header right under the name row (name,
// Leave Request, Sign out). Pages that do not, get the same row on top.
export function ScopeStatusRow({ className = "mt-3" }) {
  const scope = useContext(ScopeContext);
  useLayoutEffect(() => {
    if (!scope) return undefined;
    scope.setOwnRow((n) => n + 1);
    return () => scope.setOwnRow((n) => n - 1);
    // registers once per mounted row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!scope) return null;
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <LiveClock compact />
      <NightToggle dark={scope.dark} onToggle={scope.toggle} alwaysLabel />
    </div>
  );
}

// Pull-to-refresh on phones: pulling down from the very top reloads the
// page's data (pages that use useLiveTick), not the whole app. The browser's
// own pull-to-refresh is turned off on these screens so the two do not clash.
function usePullToRefresh() {
  const [pull, setPull] = useState(0); // px pulled
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const THRESHOLD = 70;

  useEffect(() => {
    const onStart = (e) => {
      startY.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      pullRef.current = dy > 0 && window.scrollY <= 0 ? Math.min(dy * 0.5, 110) : 0;
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (startY.current !== null && pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        refreshAll();
        setTimeout(() => setRefreshing(false), 900);
      }
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    const prev = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = "contain";
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      document.documentElement.style.overscrollBehaviorY = prev;
    };
  }, []);

  if (!pull && !refreshing) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div
      className="fixed left-1/2 top-2 z-40 -translate-x-1/2 flex items-center gap-2 bg-white border border-black/[0.08] rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-lg"
      style={{ transform: `translate(-50%, ${refreshing ? 8 : Math.max(0, pull - 30)}px)` }}
      role="status"
    >
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className={refreshing ? "animate-spin" : ""} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
      </svg>
      {refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
    </div>
  );
}

// Wrapper for pages without a shared layout (Checker, Salesman, Maintenance,
// Driver: the phone screens). Applies night mode, gives the clock/Night row
// (ScopeStatusRow) its state, and adds pull-to-refresh on phones. ice-scope lets the ice background show through the page (see
// index.css); neu gives the pages the soft UI look (see neumorphism.css).
export function NightScope({ children }) {
  const [dark, setDark] = useNightMode();
  const [ownRow, setOwnRow] = useState(0);
  const pullIndicator = usePullToRefresh();
  const scope = { dark, toggle: () => setDark((d) => !d), setOwnRow };

  return (
    <ScopeContext.Provider value={scope}>
      <div className={`${dark ? "cp-dark " : ""}neu ice-scope min-h-screen`} style={ambientStyle(dark)}>
        <NightStyle />
        {pullIndicator}
        {ownRow === 0 && (
          <div className="bg-white px-4 pt-3">
            <ScopeStatusRowStatic dark={dark} onToggle={scope.toggle} />
          </div>
        )}
        {children}
      </div>
    </ScopeContext.Provider>
  );
}

// The same row for pages that have no header row of their own (does not register)
function ScopeStatusRowStatic({ dark, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <LiveClock compact />
      <NightToggle dark={dark} onToggle={onToggle} alwaysLabel />
    </div>
  );
}
