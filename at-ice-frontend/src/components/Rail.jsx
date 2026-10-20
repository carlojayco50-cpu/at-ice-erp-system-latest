import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Desktop sidebar rail (Admin, HR and Customer layouts). It shows only its
// icons and opens while the mouse rests on it (OPEN_DELAY, so passing over it
// does not open it) or the keyboard focus is inside it, and hides again
// CLOSE_DELAY after the mouse leaves (so slipping off for a moment does not
// close it). Its slot widens with it, so the page beside it narrows and
// adjusts to fit instead of being covered (owner, 2026-10-20).
//
// Every page renders its own layout, so a new rail is mounted on each page
// change. Whether it was open and how far it was scrolled are kept here, at
// module level, so the new rail starts exactly as the old one was.
let lastOpen = false;
let lastScroll = 0;

const OPEN_DELAY = 120;
const CLOSE_DELAY = 400;

export default function Rail({ children }) {
  const [open, setOpen] = useState(lastOpen);
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
    timer.current = setTimeout(() => show(false), CLOSE_DELAY);
  }, [show]);

  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = lastScroll;
  }, []);

  // Started open (the mouse was on the old rail): the new rail gets no
  // mouseenter, so the first pointer move tells whether the mouse is still on it.
  useEffect(() => {
    if (!lastOpen) return undefined;
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
        onFocus={() => { clearTimeout(timer.current); show(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) leave(); }}
        onScroll={(e) => { lastScroll = e.currentTarget.scrollTop; }}
        className={`rail${open ? " is-open" : ""} bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto overflow-x-hidden`}
      >
        {children}
      </aside>
    </div>
  );
}
