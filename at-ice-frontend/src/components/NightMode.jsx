import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DARK_CSS, ambientStyle, useNightMode } from "../lib/theme";
import { refreshAll } from "../lib/live";
import LiveClock from "./LiveClock";
import { Icon } from "./icons";

export function NightStyle() {
  return <style>{DARK_CSS}</style>;
}

const MoonIcon = () => <Icon name="moon" size={14} />;
const SunIcon  = () => <Icon name="sun" size={14} />;

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

// Pull-to-refresh on phones: pulling straight down from the very top reloads
// the page's data (pages that use useLiveTick), not the whole app. The
// browser's own pull-to-refresh is turned off on these screens so the two do
// not clash. Only a downward pull counts: a sideways or slanted swipe is left
// to the page. The round indicator stays centered and moves straight down
// with the finger, its arc filling up until a release would refresh.
const PULL_READY = 72;
const PULL_MAX = 112;

function usePullToRefresh() {
  const [pull, setPull] = useState(0); // px pulled
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null); // { x, y, locked: null | "down" | "other" }
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null }
        : null;
    };
    const onMove = (e) => {
      const st = start.current;
      if (!st) return;
      const dx = e.touches[0].clientX - st.x;
      const dy = e.touches[0].clientY - st.y;
      if (!st.locked && Math.hypot(dx, dy) > 8) st.locked = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.5 ? "down" : "other";
      if (st.locked !== "down") return;
      // eased: follows the finger at first, then slows towards PULL_MAX
      pullRef.current = window.scrollY <= 0 && dy > 0 ? PULL_MAX * (1 - Math.exp(-dy / 190)) : 0;
      setDragging(true);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (start.current?.locked === "down" && pullRef.current >= PULL_READY) {
        setRefreshing(true);
        refreshAll();
        setTimeout(() => setRefreshing(false), 900);
      }
      start.current = null;
      pullRef.current = 0;
      setDragging(false);
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

  const ready = pull >= PULL_READY;
  const shown = pull > 4 || refreshing;
  const y = refreshing ? PULL_READY : pull;
  const progress = Math.min(1, pull / PULL_READY);
  return (
    <div
      className={`ptr ${dragging ? "is-dragging" : ""} ${shown ? "is-shown" : ""}`}
      style={{ transform: `translate3d(-50%, ${y - 48}px, 0)` }}
      role="status"
      aria-live="polite"
      aria-label={refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" className={refreshing ? "animate-spin" : ""} aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={56.5} strokeDashoffset={refreshing ? 40 : 56.5 * (1 - progress)}
          transform="rotate(-90 12 12)"
        />
      </svg>
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
