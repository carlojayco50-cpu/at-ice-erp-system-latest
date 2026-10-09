import { useState } from "react";
import { Link } from "react-router-dom";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import PasswordRules from "../components/PasswordRules";
import { RevealButton } from "../components/PasswordInput";
import { useHoldReveal } from "../lib/useHoldReveal";
import { isStrongPassword } from "../lib/password";

const MailIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const KeyIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <circle cx="7.5" cy="15.5" r="5.5" /><path d="M21 2l-9.6 9.6" /><path d="M15.5 7.5l3 3L22 7l-3-3" />
  </svg>
);

// Same field look as the login page
const fieldBox =
  "neu-inset flex items-center gap-3 pl-4 pr-1 min-h-[48px] rounded-xl focus-within:shadow-[inset_4px_4px_8px_var(--neu-lo),inset_-4px_-4px_8px_var(--neu-hi)] transition-shadow";
const fieldInput = "flex-1 bg-transparent text-[16px] text-slate-800 placeholder:text-[var(--neu-faint)] outline-none min-w-0 py-3 pr-3";
const labelCls = "text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase";
const primaryBtn =
  "mt-1 w-full min-h-[48px] py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[16px] font-semibold rounded-xl transition-[background-color,box-shadow] duration-150 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[5px_5px_12px_var(--neu-lo),-5px_-5px_12px_var(--neu-hi)]";

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error("Too many tries. Wait a minute, then try again.");
    const firstFieldError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new Error(firstFieldError || data.message || "Something went wrong. Try again.");
  }
  return data;
}

// "Forgot password?" from the login page (public). Step 1: the email gets a
// 6-digit code (POST /api/forgot-password). Step 2: the code is checked
// (POST /api/verify-reset-code). Step 3: the new password, sent with the
// confirmed code (POST /api/reset-password). Styled like the login page.
export default function ForgotPasswordPage() {
  const [step, setStep] = useState("email"); // email | code | password | done
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [form, setForm] = useState({ password: "", password_confirmation: "" });
  const [showNew, newRevealProps] = useHoldReveal();
  const [showConfirm, confirmRevealProps] = useHoldReveal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const mismatch = form.password_confirmation.length > 0 && form.password !== form.password_confirmation;
  const codeReady = /^\d{6}$/.test(code);
  const canReset = codeReady && isStrongPassword(form.password) && form.password === form.password_confirmation;

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Enter the email you sign in with."); return; }
    setBusy(true);
    setError("");
    try {
      const data = await post("/api/forgot-password", { email: email.trim() });
      setInfo(data.message);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/verify-reset-code", { email: email.trim(), code });
      setInfo("");
      setStep("password");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/reset-password", { email: email.trim(), code, ...form });
      setStep("done");
    } catch (err) {
      // The code expired or was cancelled meanwhile: ask for a new one.
      if (/code/i.test(err.message)) { setCode(""); setStep("code"); }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full min-h-[100dvh] flex items-start sm:items-center justify-center overflow-y-auto">
      <div className="fixed inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-md px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center mb-6 sm:mb-8 text-center">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none mt-3">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">AT-ICE ERP</div>
        </div>

        <div className="neu rounded-[28px] shadow-2xl shadow-black/40 bg-[var(--neu-bg)] px-5 sm:px-8 py-7 flex flex-col gap-4">
          <div className="text-center mb-1">
            <h1 className="text-[22px] font-bold text-[var(--neu-accent)] tracking-wide">
              {step === "done" ? "Password changed" : "Forgot password"}
            </h1>
            <p className="text-[13px] text-[var(--neu-muted)] mt-1">
              {step === "email" && "Enter the email you sign in with. We'll send you a 6-digit code."}
              {step === "code" && <>Enter the 6-digit code sent to <b className="text-slate-700">{email.trim()}</b>.</>}
              {step === "password" && "Code confirmed. Choose a new password."}
              {step === "done" && "Your password was changed. Sign in with your new password."}
            </p>
          </div>

          {step === "email" && (
            <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor="fp-email" className={labelCls}>Email Address</label>
                <div className={fieldBox}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><MailIcon /></span>
                  <input id="fp-email" type="email" inputMode="email" autoComplete="username" placeholder="name@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} className={fieldInput} autoFocus />
                </div>
              </div>
              {error && <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">{error}</div>}
              <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Send Code"}</button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode} className="flex flex-col gap-4" noValidate>
              {info && <div role="status" className="text-[13px] text-emerald-800 bg-emerald-100/70 border border-emerald-300/60 rounded-xl px-4 py-3 text-center">{info}</div>}
              <div className="flex flex-col gap-2">
                <label htmlFor="fp-code" className={labelCls}>6-digit Code</label>
                <div className={fieldBox}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><KeyIcon /></span>
                  <input id="fp-code" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className={`${fieldInput} tracking-[0.4em] font-mono`} autoFocus />
                </div>
              </div>
              {error && <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">{error}</div>}
              <button type="submit" disabled={!codeReady || busy} className={primaryBtn}>{busy ? "Checking…" : "Verify Code"}</button>
              <button type="button" onClick={() => sendCode()} disabled={busy} className="text-[13px] font-medium text-[var(--neu-accent)] hover:underline cursor-pointer disabled:opacity-60">
                Send a new code
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={reset} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor="fp-new" className={labelCls}>New Password</label>
                <div className={fieldBox}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><LockIcon /></span>
                  <input id="fp-new" type={showNew ? "text" : "password"} autoComplete="new-password" placeholder="Enter a new password" autoFocus
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={fieldInput} />
                  <RevealButton revealed={showNew} buttonProps={newRevealProps} className="w-11 h-11 !text-[var(--neu-faint)] hover:!text-slate-700" />
                </div>
                <PasswordRules password={form.password} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="fp-confirm" className={labelCls}>Confirm New Password</label>
                <div className={fieldBox}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><LockIcon /></span>
                  <input id="fp-confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="Type it again"
                    value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })} className={fieldInput} />
                  <RevealButton revealed={showConfirm} buttonProps={confirmRevealProps} className="w-11 h-11 !text-[var(--neu-faint)] hover:!text-slate-700" />
                </div>
                {mismatch && <span className="text-[12px] text-red-600">The passwords do not match.</span>}
              </div>
              {error && <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">{error}</div>}
              <button type="submit" disabled={!canReset || busy} className={primaryBtn}>{busy ? "Saving…" : "Change Password"}</button>
            </form>
          )}

          {step === "done" && (
            <Link to="/login" replace className={primaryBtn}>Go to Sign In</Link>
          )}

          {step !== "done" && (
            <Link to="/login" className="neu-raised-sm w-full min-h-[44px] rounded-xl text-[14px] font-medium text-[var(--neu-muted)] hover:text-slate-800 flex items-center justify-center">
              Back to Sign In
            </Link>
          )}
        </div>
        <p className="text-center text-[10px] text-white/30 mt-5 tracking-wide">© 2026 AT-ICE ERP</p>
      </div>
    </div>
  );
}
