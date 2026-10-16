import { useLayoutEffect, useRef } from "react";

// Desktop sidebar (Admin, HR and Customer layouts): always open on large
// screens, never folding on hover (owner, 2026-10-17). The page beside it
// scrolls on its own; the sidebar scrolls only when its menu is taller than
// the screen. Every page renders its own layout, so how far the menu was
// scrolled is kept here, at module level, and the new sidebar starts there.
let lastScroll = 0;

export default function Rail({ children }) {
  const asideRef = useRef(null);

  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = lastScroll;
  }, []);

  return (
    <div className="rail-slot is-open hidden lg:block flex-shrink-0">
      <aside
        ref={asideRef}
        onScroll={(e) => { lastScroll = e.currentTarget.scrollTop; }}
        className="rail is-open h-full bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto overflow-x-hidden"
      >
        {children}
      </aside>
    </div>
  );
}
