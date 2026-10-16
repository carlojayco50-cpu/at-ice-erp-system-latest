import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TimeSelect from "./TimeSelect";

// Soft UI popups for every dropdown (<select>) and date field (<input type=
// "date" | "month" | "datetime-local">) in the app. The browser draws those
// popups itself, so CSS cannot give them the neumorphic look. Mounted once in
// App.jsx: it listens on the document, so pages keep their plain native fields
// and need no changes. The native field stays the real control (value,
// required, min/max, typing, form submit); only its popup is replaced.
// A picked value is written to the field and an input/change event is fired,
// so React's onChange runs exactly as if the user had used the native popup.
// Opt out on a field with the data-native attribute.

const DATE_TYPES = new Set(["date", "month", "datetime-local"]);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isSoftField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.closest("[data-soft-popover]") || el.hasAttribute("data-native")) return false;
  if (el.tagName === "SELECT") return !el.multiple && el.size <= 1;
  return el.tagName === "INPUT" && DATE_TYPES.has(el.type);
}

// Writes a value the way a user would, so React's onChange runs.
function commitValue(el, value) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  if (el.tagName !== "SELECT") el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
// "2026-10-06", "2026-10" or "2026-10-06T09:30" -> parts (month is 0-based)
function parseValue(v) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/.exec(v || "");
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1, time: m[4] ? `${m[4]}:${m[5]}` : "" };
}

// ---- Dropdown list ----------------------------------------------------------

// Long lists (e.g. barangays) get a search box at the top.
const SEARCH_FROM = 15;
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function SelectList({ el, close }) {
  const [all] = useState(() =>
    [...el.options].map((o, i) => ({ value: o.value, label: o.text, disabled: o.disabled, i }))
  );
  const searchable = all.length > SEARCH_FROM;
  const [query, setQuery] = useState("");
  const options = query.trim()
    ? all.filter((o) => !o.disabled && fold(o.label).includes(fold(query.trim())))
    : all;
  const [active, setActive] = useState(() => Math.max(0, el.selectedIndex));
  const listRef = useRef(null);
  const searchRef = useRef(null);

  // The popup is hidden until it is placed, and a hidden field cannot take
  // focus, so focus waits a frame.
  useEffect(() => {
    const f = requestAnimationFrame(() => (searchRef.current || listRef.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(f);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (i) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (el.value !== o.value) commitValue(el, o.value);
    close(true);
  };
  const step = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (e.key === "Home" && !searchable) { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === "End" && !searchable) { e.preventDefault(); setActive(step(options.length, -1)); }
    else if (e.key === "Enter" || (e.key === " " && !searchable)) { e.preventDefault(); pick(active); }
    else if (e.key === "Tab") close(false);
    else if (searchable) return; // typing goes to the search box
    else if (e.key.length === 1) {
      // Type-ahead: jump to the next option starting with the typed letter
      const k = e.key.toLowerCase();
      const n = options.length;
      for (let j = 1; j <= n; j++) {
        const i = (active + j) % n;
        if (!options[i].disabled && options[i].label.trim().toLowerCase().startsWith(k)) { setActive(i); break; }
      }
    }
  };

  const list = (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={-1}
      aria-activedescendant={`soft-opt-${active}`}
      onKeyDown={searchable ? undefined : onKeyDown}
      className="soft-list"
    >
      {options.map((o, i) => (
        <div
          key={o.i}
          id={`soft-opt-${i}`}
          data-i={i}
          role="option"
          aria-selected={el.selectedIndex === o.i}
          aria-disabled={o.disabled || undefined}
          onMouseEnter={() => !o.disabled && setActive(i)}
          onClick={() => pick(i)}
          className={`soft-opt ${i === active ? "is-active" : ""} ${el.selectedIndex === o.i ? "is-selected" : ""} ${o.disabled ? "is-disabled" : ""}`}
        >
          <span className="truncate">{o.label || " "}</span>
          {el.selectedIndex === o.i && (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </div>
      ))}
      {options.length === 0 && <div className="soft-opt is-disabled">No match</div>}
    </div>
  );

  if (!searchable) return list;
  return (
    <div onKeyDown={onKeyDown} className="soft-searchable">
      <input
        ref={searchRef}
        type="search"
        data-native
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        placeholder="Type to search…"
        aria-label="Search the list"
        className="soft-search"
      />
      {list}
    </div>
  );
}

// ---- Calendar ---------------------------------------------------------------

const Chevron = ({ dir }) => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

function Calendar({ el, close }) {
  const type = el.type;
  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const initial = parseValue(el.value);
  const minP = parseValue(el.min);
  const maxP = parseValue(el.max);
  const minDay = minP ? ymd(minP.y, minP.m, type === "month" ? 1 : minP.d) : "";
  const maxDay = maxP ? ymd(maxP.y, maxP.m, type === "month" ? 31 : maxP.d) : "";

  const [view, setView] = useState(type === "month" ? "months" : "days");
  const [cursor, setCursor] = useState(() => {
    const base = initial || minP || { y: now.getFullYear(), m: now.getMonth() };
    return { y: base.y, m: base.m };
  });
  const [selected, setSelected] = useState(() => (initial ? ymd(initial.y, initial.m, initial.d) : ""));
  const [time, setTime] = useState(() => initial?.time || `${pad(now.getHours())}:${pad(Math.floor(now.getMinutes() / 5) * 5)}`);
  const gridRef = useRef(null);

  useEffect(() => {
    gridRef.current?.querySelector("[data-focus]")?.focus({ preventScroll: true });
  }, [view]);

  const outOfRange = (day) => (minDay && day < minDay) || (maxDay && day > maxDay);
  const monthOut = (y, m) => (minDay && ymd(y, m, 31) < minDay) || (maxDay && ymd(y, m, 1) > maxDay);

  const commitDay = (day) => {
    if (type === "datetime-local") {
      setSelected(day);
      let v = `${day}T${time}`;
      if (el.min && v < el.min) v = el.min.slice(0, 16);
      if (el.max && v > el.max) v = el.max.slice(0, 16);
      commitValue(el, v);
      return;
    }
    commitValue(el, day);
    close(true);
  };
  // "Today" for a date and time: today, keeping the chosen time unless it has
  // already passed, then the next 5 minutes from now (commitDay still keeps
  // it inside min/max, e.g. an interview that must be in the future).
  const pickToday = () => {
    const n = new Date();
    const next = new Date(n.getTime() + (5 - (n.getMinutes() % 5)) * 60000);
    const nextTime = `${pad(next.getHours())}:${pad(next.getMinutes())}`;
    const t = next.getDate() !== n.getDate() ? time : time > nextTime ? time : nextTime;
    setTime(t);
    setCursor({ y: n.getFullYear(), m: n.getMonth() });
    setSelected(todayStr);
    let v = `${todayStr}T${t}`;
    if (el.min && v < el.min) v = el.min.slice(0, 16);
    if (el.max && v > el.max) v = el.max.slice(0, 16);
    commitValue(el, v);
  };
  const commitTime = (t) => {
    setTime(t);
    if (selected && t) commitValue(el, `${selected}T${t}`);
  };

  const move = (delta) => {
    setCursor(({ y, m }) => {
      if (view === "days") { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; }
      if (view === "months") return { y: y + delta, m };
      return { y: y + delta * 12, m };
    });
  };

  const caption =
    view === "days" ? `${MONTHS[cursor.m]} ${cursor.y}` :
    view === "months" ? `${cursor.y}` :
    `${cursor.y - (cursor.y % 12)} – ${cursor.y - (cursor.y % 12) + 11}`;

  // Days grid: 6 weeks starting on the Sunday on or before the 1st
  const first = new Date(cursor.y, cursor.m, 1);
  const start = new Date(cursor.y, cursor.m, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: ymd(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === cursor.m };
  });
  const focusDay = cells.find((c) => c.key === selected && c.inMonth)?.key || cells.find((c) => c.key === todayStr)?.key || cells.find((c) => c.inMonth)?.key;

  const onGridKeyDown = (e) => {
    if (view !== "days") return;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const cur = document.activeElement?.dataset?.day;
    if (!cur) return;
    const p = parseValue(cur);
    const d = new Date(p.y, p.m, p.d + map[e.key]);
    const key = ymd(d.getFullYear(), d.getMonth(), d.getDate());
    if (d.getMonth() !== cursor.m) setCursor({ y: d.getFullYear(), m: d.getMonth() });
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-day="${key}"]`)?.focus());
  };

  const yearStart = cursor.y - (cursor.y % 12);
  const canClear = !el.required;
  const todayAllowed = !outOfRange(todayStr);

  return (
    <div className="soft-cal">
      <div className="soft-cal-head">
        <button type="button" className="soft-icon-btn" onClick={() => move(-1)} aria-label="Previous"><Chevron dir="left" /></button>
        <button
          type="button"
          className="soft-cal-caption"
          onClick={() => setView(view === "days" ? "months" : "years")}
          disabled={view === "years"}
        >
          {caption}
        </button>
        <button type="button" className="soft-icon-btn" onClick={() => move(1)} aria-label="Next"><Chevron dir="right" /></button>
      </div>

      <div ref={gridRef} onKeyDown={onGridKeyDown}>
        {view === "days" && (
          <div className="soft-days" role="grid">
            {DAYS.map((d) => <div key={d} className="soft-dow">{d}</div>)}
            {cells.map((c) => {
              const disabled = outOfRange(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  data-day={c.key}
                  data-focus={c.key === focusDay ? "" : undefined}
                  tabIndex={c.key === focusDay ? 0 : -1}
                  disabled={disabled}
                  onClick={() => commitDay(c.key)}
                  aria-pressed={c.key === selected}
                  className={`soft-day ${c.inMonth ? "" : "is-outside"} ${c.key === selected ? "is-selected" : ""} ${c.key === todayStr ? "is-today" : ""}`}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
        )}

        {view === "months" && (
          <div className="soft-grid3">
            {MONTHS.map((name, m) => {
              const isSel = initial && initial.y === cursor.y && initial.m === m;
              return (
                <button
                  key={name}
                  type="button"
                  data-focus={isSel || (!initial && m === now.getMonth()) ? "" : undefined}
                  disabled={monthOut(cursor.y, m)}
                  onClick={() => {
                    if (type === "month") { commitValue(el, `${cursor.y}-${pad(m + 1)}`); close(true); }
                    else { setCursor({ y: cursor.y, m }); setView("days"); }
                  }}
                  className={`soft-cell ${isSel ? "is-selected" : ""}`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        )}

        {view === "years" && (
          <div className="soft-grid3">
            {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => (
              <button
                key={y}
                type="button"
                data-focus={y === cursor.y ? "" : undefined}
                disabled={(minP && y < minP.y) || (maxP && y > maxP.y)}
                onClick={() => { setCursor({ y, m: cursor.m }); setView("months"); }}
                className={`soft-cell ${initial?.y === y ? "is-selected" : ""}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {type === "datetime-local" && view === "days" && (
        <div className="soft-cal-time">
          <label htmlFor="soft-time">Time</label>
          <TimeSelect id="soft-time" value={time} step={5} onChange={(e) => commitTime(e.target.value)} className="flex-1" />
        </div>
      )}

      <div className="soft-cal-foot">
        {canClear ? (
          <button type="button" className="soft-link" onClick={() => { commitValue(el, ""); close(true); }}>Clear</button>
        ) : <span />}
        {type === "datetime-local" ? (
          <span className="flex items-center gap-3">
            {todayAllowed && (
              <button type="button" className="soft-link" onClick={pickToday}>Today</button>
            )}
            <button type="button" className="soft-done" onClick={() => close(true)}>Done</button>
          </span>
        ) : todayAllowed && type === "date" ? (
          <button type="button" className="soft-link" onClick={() => commitDay(todayStr)}>Today</button>
        ) : todayAllowed && type === "month" ? (
          <button type="button" className="soft-link" onClick={() => { commitValue(el, todayStr.slice(0, 7)); close(true); }}>This month</button>
        ) : <span />}
      </div>
    </div>
  );
}

// ---- Host: opens, positions and closes the popup ------------------------------

export default function SoftPickers() {
  const [open, setOpen] = useState(null); // { el, kind, run }
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  const close = useCallback((refocus) => {
    setOpen((cur) => {
      if (cur && refocus) requestAnimationFrame(() => cur.el.focus({ preventScroll: true }));
      return null;
    });
  }, []);

  // Open on pointer down (mouse, touch or pen) instead of the native popup,
  // and on the usual keys. The native popup is blocked twice: canceling
  // pointerdown stops the mouse events that open a desktop dropdown, and
  // canceling click stops the tap that opens a picker on touch screens.
  useEffect(() => {
    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest?.("select, input");
      if (popRef.current?.contains(e.target)) return;
      if (!isSoftField(el)) {
        setOpen(null);
        return;
      }
      const isSelect = el.tagName === "SELECT";
      // A date field keeps the caret for typing with a mouse; on touch it
      // would only pop up the keyboard, so it is not focused there.
      if (isSelect || e.pointerType !== "mouse") e.preventDefault();
      if (isSelect || e.pointerType === "mouse") el.focus({ preventScroll: true });
      setOpen((cur) => {
        if (cur?.el === el) return isSelect ? null : cur;
        return { el, kind: isSelect ? "select" : "date", run: Date.now() };
      });
    };
    const onClick = (e) => {
      const el = e.target.closest?.("select, input");
      if (isSoftField(el)) e.preventDefault();
    };
    const onKeyDown = (e) => {
      const el = e.target;
      if (!isSoftField(el)) return;
      const opens =
        (el.tagName === "SELECT" && (e.key === " " || e.key === "Enter")) ||
        (e.altKey && e.key === "ArrowDown") ||
        e.key === "F4";
      if (opens) {
        e.preventDefault();
        setOpen({ el, kind: el.tagName === "SELECT" ? "select" : "date", run: Date.now() });
      } else if (e.key === "Escape") {
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // Escape inside the popup, and closing when the field disappears.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(true); }
    };
    const pop = popRef.current;
    pop?.addEventListener("keydown", onKey);
    return () => pop?.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Place the popup under the field (above it when there is no room), and keep
  // it there while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!open.el.isConnected) { setOpen(null); return; }
      const r = open.el.getBoundingClientRect();
      const pop = popRef.current;
      const h = pop ? pop.offsetHeight : 320;
      const w = open.kind === "date" ? 292 : Math.max(r.width, 180);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const below = r.bottom + 8 + h <= vh || r.top - 8 - h < 0;
      setPos({
        top: below ? r.bottom + 8 : r.top - 8 - h,
        left: Math.min(Math.max(8, r.left), vw - w - 8),
        width: w,
        maxHeight: below ? vh - r.bottom - 16 : r.top - 16,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  if (!open) return null;
  const dark = !!open.el.closest(".cp-dark, .neu-dark");

  return createPortal(
    <div
      ref={popRef}
      data-soft-popover
      className={`soft-pop ${dark ? "neu-dark" : ""}`}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: open.kind === "select" ? Math.min(300, pos.maxHeight) : undefined } : { visibility: "hidden" }}
    >
      {open.kind === "select"
        ? <SelectList key={open.run} el={open.el} close={close} />
        : <Calendar key={open.run} el={open.el} close={close} />}
    </div>,
    document.body
  );
}
