import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./icons";

const LogOutIcon = () => <Icon name="logout" size={17} />;

// Profile menu at the top right of every portal (like facebook.com): the
// avatar opens a dropdown with the signed-in user's name and email, Account
// settings when the role has that page, and Sign out (which still asks to
// confirm through the page's useLogoutConfirm dialog).
//
// On a phone (below sm) the menu is not used; sign out works as it did before:
//   mobileSignOut (Checker, Salesman, Maintenance, Driver screens): the plain
//     sign-out icon in the header;
//   otherwise (Admin, HR, Customer): the avatar only, and Sign out sits at the
//     bottom of the slide-out sidebar.
export default function HeaderAvatar(props) {
  const { initials, name, onSignOut, mobileSignOut = false } = props;
  return (
    <>
      <div className="hidden sm:block">
        <AvatarMenu {...props} />
      </div>
      {mobileSignOut && onSignOut ? (
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="sm:hidden flex items-center text-red-500 active:text-red-600 transition-colors cursor-pointer p-1"
        >
          <LogOutIcon />
        </button>
      ) : (
        <div
          className="sm:hidden w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center text-[11px] font-semibold text-cyan-500 flex-shrink-0"
          title={name}
          aria-label={name}
        >
          {initials}
        </div>
      )}
    </>
  );
}

function AvatarMenu({ initials, name, subtitle, onSignOut, settingsPath }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();
  const email = user?.email || "";

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        title={name}
        className="topbar-avatar w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center text-[11px] font-semibold text-cyan-500 cursor-pointer"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 bg-white border border-black/[0.09] rounded-xl shadow-2xl p-2"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-[12px] font-semibold text-cyan-500">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-800 truncate">{name}</div>
              {(subtitle || email) && <div className="text-[11px] text-slate-400 truncate">{subtitle || email}</div>}
            </div>
          </div>
          <div className="my-1 border-t border-black/[0.06]" />
          {settingsPath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); navigate(settingsPath); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer text-left"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Account settings
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50 cursor-pointer text-left"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
