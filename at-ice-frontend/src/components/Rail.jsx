import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Desktop sidebar rail (Admin, HR and Customer layouts). It shows only its
// icons and opens while the mouse rests on it (OPEN_DELAY, so passing over it
// does not open it) or the keyboard focus is inside it, and hides again
// CLOSE_DELAY after the mouse leaves (so slipping off for a moment does not
// close it). Its slot widens with it, so the page beside it narrows and
// adjusts to fit instead of being covered (owner, 2026-10-20).
//
// Clicking a menu link keeps it open (owner, 2026-10-20): from then on it no
// longer hides when the mouse leaves, also after a page change or a refresh
// (saved in localStorage), until the Hide menu button at its top is pressed.
//
// Every page renders its own layout, so a new rail is mounted on each page
// change. Whether it was open and how far it was scrolled are kept here, at
// module level, so the new rail starts exactly as the old one was.
const KEEP_KEY = "rail:keep-open";
const readKeep = () => {
  try { return localStorage.getItem(KEEP_KEY) === "1"; } catch { return false; }
};
const writeKeep = (on) => {
  try { if (on) localStorage.setItem(KEEP_KEY, "1"); else localStorage.removeItem(KEEP_KEY); } catch { /* private mode */ }
};

let keepOpen = readKeep();
let lastOpen = keepOpen;
let lastScroll = 0;

const OPEN_DELAY = 120;
const CLOSE_DELAY = 400;

const HideIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
  </svg>
);

export default function Rail({ children }) {
  const [keep, setKeep] = useState(readKeep);
  const [open, setOpen] = useState(() => lastOpen || readKeep());
  const asideRef = useRef(null);
  const timer = useRef(0);

  const show = useCallback((value) => {
    lastOpen = value;
    setOpen(value);
  }, []);
  const enter = () => {
    clearTimeout(timer.current);
    if (!lastOpen) timer.current = setTimeout(() => show(true), OPEN_DELAY);
  };
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    if (keepOpen) return; // kept open after a menu click
    timer.current = setTimeout(() => show(false), CLOSE_DELAY);
  }, [show]);

  // A click on a menu link keeps the sidebar open from now on.
  const onClickCapture = (e) => {
    if (keepOpen || !e.target.closest?.("a[href]")) return;
    keepOpen = true;
    writeKeep(true);
    setKeep(true);
    clearTimeout(timer.current);
    show(true);
  };
  const hide = () => {
    keepOpen = false;
    writeKeep(false);
    setKeep(false);
    clearTimeout(timer.current);
    show(false);
  };

  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = lastScroll;
  }, []);

  // Started open (the mouse was on the old rail): the new rail gets no
  // mouseenter, so the first pointer move tells whether the mouse is still on it.
  useEffect(() => {
    if (!lastOpen || keepOpen) return undefined;
    const check = (e) => {
      const el = asideRef.current;
      if (el && !el.contains(e.target) && !el.contains(document.activeElement)) leave();
    };
    document.addEventListener("pointermove", check, { once: true });
    return () => document.removeEventListener("pointermove", check);
  }, [leave]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className={`rail-slot hidden lg:block flex-shrink-0${open ? " is-open" : ""}`}>
      <aside
        ref={asideRef}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClickCapture={onClickCapture}
        onFocus={() => { clearTimeout(timer.current); show(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) leave(); }}
        onScroll={(e) => { lastScroll = e.currentTarget.scrollTop; }}
        className={`rail${open ? " is-open" : ""} relative bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto overflow-x-hidden`}
      >
        {keep && open && (
          <button
            type="button"
            data-no-confirm
            onClick={hide}
            title="Hide menu (it then opens again when the mouse rests on it)"
            aria-label="Hide menu"
            className="rail-label rail-hide absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <HideIcon />
          </button>
        )}
        {children}
      </aside>
    </div>
  );
}
