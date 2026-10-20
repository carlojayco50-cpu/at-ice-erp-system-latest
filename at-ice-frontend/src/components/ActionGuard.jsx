import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { confirmationFor, tipFor } from "../lib/actionRules";
import { setConfirmHost } from "../lib/confirm";

// Every action is confirmed and every action button explains itself
// (owner, 2026-10-20). Mounted once in App.jsx, it works on the rendered
// buttons of every page, so pages need no changes (rules: lib/actionRules.js):
//   - a click on a button that changes records is held back and a dialog
//     asks first; "Yes" clicks the button again for real. On a phone (and on
//     the Maintenance, Checker and Salesman screens) it is a bottom sheet.
//   - resting the mouse on an action button shows a short reminder of what
//     it does (its title, data-tip, or one made from its label).
// Code can ask too: confirmAction() in lib/confirm.js.

const TIP_DELAY = 450;

const isSheet = (el) => window.innerWidth < 640 || !!el?.closest?.(".role-shell");
const isDark = (el) => !!(el?.closest?.(".cp-dark, .neu-dark") || document.querySelector(".cp-dark"));

export default function ActionGuard() {
  const [ask, setAsk] = useState(null); // { title, message, context, confirmLabel, danger, sheet, dark, resolve }
  const [tip, setTip] = useState(null); // { text, x, y, below, dark }
  const passRef = useRef(null);
  const confirmRef = useRef(null);
  const returnFocus = useRef(null);

  const open = useCallback((opts, el) => new Promise((resolve) => {
    returnFocus.current = document.activeElement;
    setTip(null);
    setAsk({ ...opts, sheet: isSheet(el || document.activeElement), dark: isDark(el || document.activeElement), resolve });
  }), []);

  useEffect(() => {
    setConfirmHost((opts) => open(opts));
    return () => setConfirmHost(null);
  }, [open]);

  const finish = useCallback((yes) => {
    setAsk((a) => {
      a?.resolve(yes);
      return null;
    });
    const el = returnFocus.current;
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus?.({ preventScroll: true }));
  }, []);

  // Hold back clicks on guarded buttons (capture phase, before React sees it)
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target.closest?.("button, [role='button']");
      if (!btn) return;
      if (passRef.current === btn) { passRef.current = null; return; }
      const c = confirmationFor(btn);
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      open(c, btn).then((yes) => {
        if (!yes || !document.contains(btn) || btn.disabled) return;
        passRef.current = btn;
        btn.click();
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  // Hover reminders (mouse only; phones have no hover)
  useEffect(() => {
    let timer = 0;
    let current = null;
    const hide = () => { clearTimeout(timer); current = null; setTip(null); };
    const over = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const el = e.target.closest?.("button, [role='button'], a[title], a[data-tip]");
      if (el === current) return;
      hide();
      if (!el || el.closest(".guard-host, [data-no-tip]") || el.disabled && !el.title) return;
      // the native tooltip would show on top of ours: keep its text as data-tip
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute("title"); }
      const text = tipFor(el);
      if (!text) return;
      current = el;
      timer = setTimeout(() => {
        if (current !== el || !document.contains(el)) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 64;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below, dark: isDark(el) });
      }, TIP_DELAY);
    };
    const out = (e) => { if (current && !current.contains(e.relatedTarget)) hide(); };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerout", out, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Escape = No, Enter = Yes; focus starts on the safe choice
  useEffect(() => {
    if (!ask) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    };
    window.addEventListener("keydown", onKey, true);
    const f = requestAnimationFrame(() => confirmRef.current?.parentElement?.querySelector("[data-guard-no]")?.focus());
    return () => { window.removeEventListener("keydown", onKey, true); cancelAnimationFrame(f); };
  }, [ask, finish]);

  return createPortal(
    <>
      {tip && (
        <div
          role="tooltip"
          className={`guard-host guard-tip ${tip.below ? "is-below" : ""} ${tip.dark ? "neu-dark" : ""}`}
          style={{ left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140), top: tip.y }}
        >
          {tip.text}
        </div>
      )}
      {ask && (
        <div className={`guard-host guard-layer ${ask.sheet ? "is-sheet" : ""} ${ask.dark ? "neu-dark" : ""}`}>
          <div className="guard-backdrop" onClick={() => finish(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="guard-title" aria-describedby="guard-msg" className="guard-card">
            {ask.sheet && <div className="guard-grip" aria-hidden="true" />}
            <div className={`guard-icon ${ask.danger ? "is-danger" : ""}`} aria-hidden="true">
              {ask.danger ? (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              ) : (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              )}
            </div>
            <h2 id="guard-title" className="guard-title">{ask.title}</h2>
            {ask.context && <div className="guard-context">{ask.context}</div>}
            <p id="guard-msg" className="guard-msg">{ask.message}</p>
            <div className="guard-actions">
              <button type="button" data-guard-no className="guard-btn" onClick={() => finish(false)}>No, go back</button>
              <button type="button" ref={confirmRef} className={`guard-btn is-primary ${ask.danger ? "is-danger" : ""}`} onClick={() => finish(true)}>
                {ask.confirmLabel || "Yes, continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
