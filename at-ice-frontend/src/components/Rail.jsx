import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Desktop sidebar rail (Admin, HR and Customer layouts). It shows only its
// icons and opens while the mouse is on it or the keyboard focus is inside it,
// closing again 400ms after the mouse leaves.
//
// Every page renders its own layout, so a new rail is mounted on each page
// change. Whether it was open and how far it was scrolled are kept here, at
// module level, so the new rail starts exactly as the old one was: clicking a
// menu link no longer folds the sidebar and opens it again (the "twitch"),
// and the menu does not jump back to the top.
let lastOpen = false;
let lastScroll = 0;

const CLOSE_DELAY = 400;

export default function Rail({ children }) {
  const [open, setOpen] = useState(lastOpen);
  const asideRef = useRef(null);
  const closeTimer = useRef(0);

  const show = useCallback((value) => {
    lastOpen = value;
    setOpen(value);
  }, []);
  const enter = () => {
    clearTimeout(closeTimer.current);
    show(true);
  };
  const leave = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => show(false), CLOSE_DELAY);
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

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <div className={`rail-slot hidden lg:block flex-shrink-0${open ? " is-open" : ""}`}>
      <aside
        ref={asideRef}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) leave(); }}
        onScroll={(e) => { lastScroll = e.currentTarget.scrollTop; }}
        className={`rail${open ? " is-open" : ""} sticky top-0 h-screen bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto overflow-x-hidden`}
      >
        {children}
      </aside>
    </div>
  );
}
