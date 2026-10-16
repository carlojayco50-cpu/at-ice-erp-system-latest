import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// Shared sidebar menu (Admin, HR and Customer layouts), laid out like
// Discord's settings sidebar: top-level sections with an icon; the section of
// the current page is highlighted and opens its pages underneath, indented on
// a thin line, the current page bold with a short accent on the line. Other
// sections stay closed until the mouse rests on one, which opens its pages
// underneath without a click (closing again shortly after the mouse leaves);
// clicking a section opens its first page. Menus per role are in lib/nav.jsx.
// On the collapsed desktop rail only the icons show.

const ChevDown = () => <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>;

const splitTo = (to) => {
  const [path, hash = ""] = to.split("#");
  return { path, hash };
};
const onPath = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`);
const pagesOf = (item) => item.children || [{ label: item.label, to: item.to }];

// The mouse must rest on a section this long before it opens (so passing over
// sections on the way down does not open each one), and a section it left
// closes after CLOSE_MS (so slipping off for a moment does not close it).
const OPEN_MS = 120;
const CLOSE_MS = 250;

// The page sections a top-level item jumps to (children with "#id") while
// that page is open, in page order.
function sectionIdsOf(item, pathname) {
  if (!item?.children) return [];
  return item.children
    .map((c) => splitTo(c.to))
    .filter((t) => t.hash && onPath(pathname, t.path))
    .map((t) => t.hash);
}

// The section scrolled into view: the last one whose top has passed the top
// bar, or the last one once the page is scrolled to the bottom.
function currentSection(ids) {
  const main = document.querySelector(".ice-main");
  const scroller = main && main.scrollHeight > main.clientHeight + 1 ? main : document.scrollingElement;
  let current = ids[0];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= 140) current = id;
  }
  if (scroller && scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
    current = ids[ids.length - 1];
  }
  return current;
}

export default function SideNav({ items, onNavigate }) {
  const location = useLocation();
  const { pathname, hash, key } = location;
  const activeItem = items.find((item) => pagesOf(item).some((p) => onPath(pathname, splitTo(p.to).path)));
  const sectionIds = sectionIdsOf(activeItem, pathname);
  const idsKey = sectionIds.join(",");
  const [spied, setSpied] = useState("");
  const holdUntil = useRef(0);
  const [hovered, setHovered] = useState("");
  const hoverTimer = useRef(0);

  const hoverIn = (label) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(label), hovered ? 0 : OPEN_MS);
  };
  const hoverOut = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(""), CLOSE_MS);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // A "#id" link scrolls to that section (retrying while the page renders)
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    holdUntil.current = Date.now() + 900;
    let tries = 0;
    let timer;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setSpied(id);
      } else if (tries++ < 20) {
        timer = setTimeout(tryScroll, 50);
      }
    };
    timer = setTimeout(tryScroll, 0);
    return () => clearTimeout(timer);
  }, [hash, key]);

  // Highlight the section in view while the page scrolls
  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(",");
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Date.now() < holdUntil.current) return;
        setSpied(currentSection(ids));
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [idsKey]);

  const activeSection = sectionIds.includes(spied) ? spied : sectionIds[0];
  const isCurrentPage = (to) => {
    const t = splitTo(to);
    if (!onPath(pathname, t.path)) return false;
    return t.hash ? t.hash === activeSection : true;
  };
  const go = () => onNavigate?.();

  return (
    <nav aria-label="Main menu" className="sidenav py-2.5 flex-1">
      {items.map((item) => {
        const isActive = item === activeItem;
        const first = pagesOf(item)[0].to;
        const open = Boolean(item.children) && (isActive || hovered === item.label);
        return (
          <div key={item.label} onMouseEnter={() => hoverIn(item.label)} onMouseLeave={hoverOut}>
            <Link
              to={first}
              onClick={go}
              title={item.label}
              aria-current={isActive && !item.children ? "page" : undefined}
              className={`flex items-center gap-2.5 px-[18px] py-[7px] text-[13px] cursor-pointer transition-all duration-100 border-l-2 ${isActive ? "text-cyan-500 bg-cyan-500/[0.08] border-cyan-500" : "text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50"}`}
            >
              <span className="opacity-80 flex-shrink-0">{item.icon}</span>
              <span className="rail-label truncate flex-1">{item.label}</span>
              {item.children && (
                <span className={`rail-label sidenav-chev flex-shrink-0 ${open ? "" : "-rotate-90"}`}><ChevDown /></span>
              )}
            </Link>
            {item.children && (
              <div className={`sidenav-sub${open ? " is-open" : ""}`} inert={!open}>
                <div>
                  <ul className="sidenav-list">
                    {item.children.map((child) => {
                      const current = isCurrentPage(child.to);
                      return (
                        <li key={child.to}>
                          <Link
                            to={child.to}
                            onClick={go}
                            aria-current={current ? (splitTo(child.to).hash ? "location" : "page") : undefined}
                            className={`sidenav-link rail-label${current ? " is-current" : ""}`}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
