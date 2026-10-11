import { useState } from "react";
import { useNavigate } from "react-router-dom";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import { LOGIN_PATH, clearSession, homePathFor } from "../lib/auth";
import PasswordRules from "../components/PasswordRules";
import { RevealButton } from "../components/PasswordInput";
import { useReveal } from "../lib/useReveal";
import { useLogoutConfirm } from "../lib/useLogoutConfirm";
import { isStrongPassword } from "../lib/password";

const PORTAL_LABEL = {
  admin: "Admin Portal",
  hr: "HR Portal",
  employee: "Employee Portal",
  driver: "Driver Portal",
  customer: "Customer Portal",
};

const LockIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Same field look as the login page
const fieldBox =
  "neu-inset flex items-center gap-3 pl-4 pr-1 min-h-[48px] rounded-xl focus-within:shadow-[inset_4px_4px_8px_var(--neu-lo),inset_-4px_-4px_8px_var(--neu-hi)] transition-shadow";
const fieldInput = "flex-1 bg-transparent text-[16px] text-slate-800 placeholder:text-[var(--neu-faint)] outline-none min-w-0 py-3 pr-3";
const labelCls = "text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase";

// Shown on first login. A new account (customer, employee or driver) starts with
// a one-time password and cannot use the system until it is changed (the server
// enforces this too). The one-time password was already checked at login, so it
// is not asked again. Styled like the login page.
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const subRole = localStorage.getItem("sub_role");
  const [form, setForm] = useState({ password: "", password_confirmation: "" });
  // each eye button shows or hides its password
  const [showNew, newRevealProps] = useReveal();
  const [showConfirm, confirmRevealProps] = useReveal();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mismatch = form.password_confirmation.length > 0 && form.password !== form.password_confirmation;
  const canSubmit = isStrongPassword(form.password) && form.password === form.password_confirmation;

  const signOut = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
    } catch {
      // the local session is cleared either way
    }
    clearSession();
    navigate("/login", { replace: true });
  };
  const [askSignOut, signOutDialog] = useLogoutConfirm(signOut);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const firstFieldError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(firstFieldError || data.message || "Could not change the password.");
      }
      localStorage.removeItem("must_change_password");
      navigate(homePathFor(role, subRole) || LOGIN_PATH, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="relative w-full min-h-[100dvh] flex items-start sm:items-center justify-center overflow-y-auto">
      {/* Background (same as the login page) */}
      <div
        className="fixed inset-0"
        style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-md px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center mb-6 sm:mb-8 text-center">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none mt-3">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">{PORTAL_LABEL[role] || "AT-ICE ERP"}</div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="neu rounded-[28px] shadow-2xl shadow-black/40 bg-[var(--neu-bg)] px-5 sm:px-8 py-7 flex flex-col gap-4"
          noValidate
        >
          {/* Inside the .neu card so the sign-out dialog gets the soft UI look */}
          {signOutDialog}
          <div className="text-center mb-1">
            <h1 className="text-[22px] font-bold text-[var(--neu-accent)] tracking-wide">Set your own password</h1>
            <p className="text-[13px] text-[var(--neu-muted)] mt-1">
              You signed in with a one-time password. Choose a new one to continue to your account.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="new-password" className={labelCls}>New Password</label>
            <div className={fieldBox}>
              <span className="text-[var(--neu-faint)] flex-shrink-0"><LockIcon /></span>
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Enter a new password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={fieldInput}
              />
              <RevealButton revealed={showNew} buttonProps={newRevealProps} className="w-11 h-11 !text-[var(--neu-faint)] hover:!text-slate-700" />
            </div>
            <PasswordRules password={form.password} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-password" className={labelCls}>Confirm New Password</label>
            <div className={fieldBox}>
              <span className="text-[var(--neu-faint)] flex-shrink-0"><LockIcon /></span>
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Type it again"
                value={form.password_confirmation}
                onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                className={fieldInput}
              />
              <RevealButton revealed={showConfirm} buttonProps={confirmRevealProps} className="w-11 h-11 !text-[var(--neu-faint)] hover:!text-slate-700" />
            </div>
            {mismatch && <span className="text-[12px] text-red-600">The passwords do not match.</span>}
          </div>

          {error && (
            <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="mt-1 w-full min-h-[48px] py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[16px] font-semibold rounded-xl transition-[background-color,box-shadow] duration-150 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[5px_5px_12px_var(--neu-lo),-5px_-5px_12px_var(--neu-hi)] active:shadow-[inset_3px_3px_6px_rgba(8,51,68,0.45),inset_-3px_-3px_6px_rgba(255,255,255,0.2)]"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Change Password and Continue"
            )}
          </button>
          <button
            type="button"
            onClick={askSignOut}
            className="neu-raised-sm w-full min-h-[44px] rounded-xl text-[14px] font-medium text-red-600 hover:text-red-700 active:shadow-[var(--neu-inset-sm)] cursor-pointer"
          >
            Sign out
          </button>
        </form>
        <p className="text-center text-[10px] text-white/30 mt-5 tracking-wide">© 2026 AT-ICE ERP</p>
      </div>
    </div>
  );
}
