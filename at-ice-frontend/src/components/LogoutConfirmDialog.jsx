import { useEffect } from "react";

// "Are you sure you want to log out?" dialog. Opened through useLogoutConfirm.
// Uses the same card as every other confirmation (components/ActionGuard.jsx,
// the guard-* classes in index.css), so there is one dialog design in the app.
export default function LogoutConfirmDialog({ open, onCancel, onConfirm }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="guard-host guard-layer">
      <div className="guard-backdrop" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-msg" className="guard-card">
        <h2 id="logout-confirm-title" className="guard-title">Log out?</h2>
        <p id="logout-confirm-msg" className="guard-msg">Are you sure you want to log out?</p>
        <div className="guard-actions">
          <button type="button" autoFocus className="guard-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="guard-btn is-primary" onClick={onConfirm}>Log out</button>
        </div>
      </div>
    </div>
  );
}
