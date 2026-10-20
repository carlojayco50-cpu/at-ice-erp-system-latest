// "Are you sure?" from code: `if (!(await confirmAction({ ... }))) return;`
// Shown by components/ActionGuard.jsx (mounted once in App.jsx) in the same
// dialog every confirmation uses: centered on a computer, a bottom sheet on a
// phone. A button whose handler asks this way carries data-no-confirm, so it
// is not asked twice.
let host = null;

export function setConfirmHost(fn) {
  host = fn;
}

// { title, message, context?, confirmLabel?, danger? } -> Promise<boolean>
export function confirmAction(opts) {
  if (!host) return Promise.resolve(window.confirm(`${opts.title}\n${opts.message || ""}`));
  return host(opts);
}
