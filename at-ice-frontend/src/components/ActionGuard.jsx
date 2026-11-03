import { useCallback, useEffect, useId, useRef, useState } from "react";
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

  // Buttons and links never carry a browser title: it would pop up on top of
  // the reminder below. The text moves to data-tip (and names an icon-only
  // button for screen readers), as soon as the element shows up.
  useEffect(() => {
    const SEL = "button[title], [role='button'][title], a[title]";
    const move = (el) => {
      // a disabled button gets no hover events, so its reason stays a browser title
      if (!el.title || el.disabled || el.closest(".leaflet-container")) return;
      if (!el.dataset.tip) el.dataset.tip = el.title;
      if (!el.textContent.trim() && !el.getAttribute("aria-label")) el.setAttribute("aria-label", el.title);
      el.removeAttribute("title");
    };
    const sweep = (root) => {
      if (root.nodeType !== 1) return;
      if (root.matches(SEL)) move(root);
      root.querySelectorAll(SEL).forEach(move);
    };
    sweep(document.body);
    const watch = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "attributes") sweep(m.target);
        else m.addedNodes.forEach(sweep);
      }
    });
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    return () => watch.disconnect();
  }, []);

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
      el.querySelectorAll("[title]").forEach((n) => n.removeAttribute("title"));
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
        <ConfirmCard
          title={ask.title}
          context={ask.context}
          message={ask.message}
          danger={ask.danger}
          confirmLabel={ask.confirmLabel}
          sheet={ask.sheet}
          dark={ask.dark}
          confirmRef={confirmRef}
          onCancel={() => finish(false)}
          onConfirm={() => finish(true)}
        />
      )}
    </>,
    document.body
  );
}

const WarnIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);
const CheckIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="8 12.5 11 15.5 16 9.5" /></svg>
);

// The one confirmation card: the "are you sure?" above, and page dialogs that
// need a little more (Reject with a reason) use it too, so Approve and Reject
// look the same: icon (warning for a destructive action, check otherwise),
// title, the record, what happens in a pressed-in box, then Cancel and the action.
export function ConfirmCard({
  title, context, message, children, danger = false,
  confirmLabel = "Yes, continue", cancelLabel = "Cancel",
  busy = false, confirmDisabled = false,
  sheet = typeof window !== "undefined" && window.innerWidth < 640, dark = false,
  confirmRef, onCancel, onConfirm,
}) {
  const id = useId();
  return (
    <div className={`guard-host guard-layer ${sheet ? "is-sheet" : ""} ${dark ? "neu-dark" : ""}`}>
      <div className="guard-backdrop" onClick={() => !busy && onCancel()} />
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-m`}
        className="guard-card"
        onSubmit={(e) => { e.preventDefault(); if (!busy && !confirmDisabled) onConfirm(); }}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); } }}
      >
        {sheet && <div className="guard-grip" aria-hidden="true" />}
        <div className={`guard-icon ${danger ? "is-danger" : ""}`} aria-hidden="true">{danger ? <WarnIcon /> : <CheckIcon />}</div>
        <h2 id={`${id}-t`} className="guard-title">{title}</h2>
        <div id={`${id}-m`} className="guard-body">
          {context && <div className="guard-context">{context}</div>}
          {message && <p className="guard-msg">{message}</p>}
        </div>
        {children}
        <div className="guard-actions">
          <button type="button" data-guard-no className="guard-btn" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="submit" ref={confirmRef} className={`guard-btn is-primary ${danger ? "is-danger" : ""}`} disabled={busy || confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
