import { useEffect } from "react";

// Mounted once in App.jsx. When the mouse rests on a text, field or dropdown
// whose content does not fit (a truncated name, a long address, a long value
// in a narrow field), its whole text shows as the hover tip. Elements that
// already have their own title or tip are left alone.
const TARGET = ".truncate, [class*='line-clamp'], input:not([type=checkbox]):not([type=radio]):not([type=file]), select, td, th, button, a, label";

function fullText(el) {
  if (el.matches("select")) return el.selectedOptions?.[0]?.text || "";
  if (el.matches("input")) return el.value || el.placeholder || "";
  return (el.innerText || "").trim().replace(/\s+/g, " ");
}

function overflows(el) {
  if (el.matches("input, select")) {
    const cs = getComputedStyle(el);
    const ctx = overflows.ctx || (overflows.ctx = document.createElement("canvas").getContext("2d"));
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.matches("select") ? 18 : 0);
    return ctx.measureText(fullText(el)).width > room + 1;
  }
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

export default function OverflowTitle() {
  useEffect(() => {
    const onOver = (e) => {
      const el = e.target instanceof Element ? e.target.closest(TARGET) : null;
      if (!el || el.hasAttribute("data-tip") || (el.title && !el.dataset.autoTitle)) return;
      const text = fullText(el);
      if (text && overflows(el)) {
        el.title = text;
        el.dataset.autoTitle = "1";
      } else if (el.dataset.autoTitle) {
        el.removeAttribute("title");
        delete el.dataset.autoTitle;
      }
    };
    document.addEventListener("mouseover", onOver, true);
    return () => document.removeEventListener("mouseover", onOver, true);
  }, []);
  return null;
}
