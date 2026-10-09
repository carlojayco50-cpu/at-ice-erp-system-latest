import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import { PinEntry } from "../components/KioskScreens";
import { RevealButton } from "../components/PasswordInput";
import { useHoldReveal } from "../lib/useHoldReveal";
import { clearSession, postLoginPath, saveSession } from "../lib/auth";
import { isBlockedDevice } from "../lib/kiosk";
import { takeSessionExpiredNotice } from "../lib/sessionExpiry";
import { playSplash } from "../lib/splash";

const MailIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2,4 12,13 22,4" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const fieldBox =
  "neu-inset flex items-center gap-3 pl-4 min-h-[48px] rounded-xl focus-within:shadow-[inset_4px_4px_8px_var(--neu-lo),inset_-4px_-4px_8px_var(--neu-hi)] transition-shadow";
// 16px text stops iOS from zooming the page when the field is focused
const fieldInput = "flex-1 bg-transparent text-[16px] text-slate-800 placeholder:text-[var(--neu-faint)] outline-none min-w-0 py-3 pr-4";

// Sliding card geometry (px): card height, how far the Attendance Station
// panel stops from the top when open, and how much of it peeks when closed.
const CARD_H = 560;
const KIOSK_TOP = 64;
const PEEK = 72;

// The one login page for every role. After login the user goes to their own
// dashboard, chosen by the role and sub_role the API returns.
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // the password shows only while the eye is held down
  const [showPassword, revealProps] = useHoldReveal();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "Your session expired..." after an API call came back 401 (see lib/sessionExpiry.js)
  const [notice, setNotice] = useState(() => takeSessionExpiredNotice());

  // Sliding card: "login" shows the sign-in form, "kiosk" the Attendance Station PIN.
  const [mode, setMode] = useState("login");
  const kiosk = mode === "kiosk";
  const [kioskBlocked, setKioskBlocked] = useState(false);
  // Bumped on every open so the PIN boxes start empty and take the focus.
  const [pinRun, setPinRun] = useState(0);
  const showKiosk = () => {
    if (kiosk) return;
    setKioskBlocked(isBlockedDevice());
    setPinRun((n) => n + 1);
    setMode("kiosk");
  };
  const showLogin = () => setMode("login");

  useEffect(() => {
    if (!kiosk) return;
    const onKey = (e) => e.key === "Escape" && setMode("login");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kiosk]);

  // A user who is already signed in goes straight to their dashboard. The saved
  // token is checked first, so an expired one does not leave them stuck.
  const [existing, setExisting] = useState(null); // null = checking, false = none, string = path
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setExisting(false);
      return;
    }
    let cancelled = false;
    fetch("/api/me", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (cancelled) return;
        const path = res.ok
          ? postLoginPath(
              localStorage.getItem("role"),
              localStorage.getItem("sub_role"),
              localStorage.getItem("must_change_password") === "1"
            )
          : null;
        if (!path) clearSession();
        if (!res.ok) {
          // The saved token was rejected: tell the user why they are seeing the form.
          const expired = takeSessionExpiredNotice();
          if (expired) setNotice(expired);
        }
        setExisting(path || false);
      })
      .catch(() => {
        if (!cancelled) setExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Invalid credentials. Please try again.");
        return;
      }

      const role = data.role || data.user?.role;
      const path = postLoginPath(role, data.sub_role, data.must_change_password);
      if (!path) {
        // An employee account without a role cannot be sent anywhere. Revoke the token just issued.
        fetch("/api/logout", {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${data.token}` },
        }).catch(() => {});
        setError("Your account has no role assigned. Contact HR.");
        return;
      }

      saveSession({ ...data, role });
      playSplash();
      navigate(path, { replace: true });
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (typeof existing === "string") return <Navigate to={existing} replace />;
  if (existing === null) {
    return <div className="min-h-[100dvh] w-full bg-slate-900" aria-busy="true" />;
  }

  return (
    <div className="relative w-full min-h-[100dvh] flex items-start sm:items-center justify-center overflow-y-auto">
      {/* Background */}
      <div
        className="fixed inset-0"
        style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-md px-4 py-8 sm:py-10">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6 sm:mb-8 text-center">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none mt-3">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">AT-ICE ERP</div>
        </div>

        {/* Sliding card (idea from Nazia-99/Sliding-Login-Form). The sign-in form
            is the base layer; the Attendance Station panel lies over it and
            peeks from the bottom. Clicking its title slides it up over the form
            and shows the HR PIN; clicking "Login" (or Esc, or Cancel) slides it
            back down. Only transform and opacity animate. */}
        <div className="relative rounded-[28px] overflow-hidden shadow-2xl shadow-black/40 bg-[var(--neu-bg)]"
          style={{ height: CARD_H }}>
          {/* Base layer: sign in */}
          <div className="absolute inset-0 flex flex-col px-5 sm:px-8">
            <button
              type="button"
              onClick={showLogin}
              tabIndex={kiosk ? 0 : -1}
              aria-label={kiosk ? "Back to Login" : undefined}
              className={`slide-title self-center mt-6 text-[34px] font-bold text-[var(--neu-accent)] tracking-wide cursor-pointer transition-transform duration-500 ease-in-out ${kiosk ? "scale-[0.6] hover:text-cyan-600" : "scale-100 cursor-default"}`}
            >
              Login
            </button>

            <div
              inert={kiosk}
              className={`transition-opacity duration-500 ${kiosk ? "opacity-0" : "opacity-100 delay-200"}`}
            >
              <div className="text-center mt-1 mb-5">
                <h1 className="text-[16px] font-semibold text-slate-800 leading-tight">Sign in to your account</h1>
                <p className="text-[13px] text-[var(--neu-muted)] mt-1">Use the email and password given to you.</p>
              </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor="login-email" className="text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase">
                  Email Address
                </label>
                <div className={fieldBox}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><MailIcon /></span>
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    enterKeyHint="next"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={fieldInput}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="login-password" className="text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase">
                  Password
                </label>
                <div className={`${fieldBox} pr-1`}>
                  <span className="text-[var(--neu-faint)] flex-shrink-0"><LockIcon /></span>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    enterKeyHint="go"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={fieldInput}
                  />
                  <RevealButton revealed={showPassword} buttonProps={revealProps} className="w-11 h-11 !text-[var(--neu-faint)] hover:!text-slate-700" />
                </div>
                <Link to="/forgot-password" className="self-end text-[13px] font-medium text-[var(--neu-accent)] hover:underline">
                  Forgot password?
                </Link>
              </div>

              {notice && !error && (
                <div role="status" className="text-[13px] text-amber-800 bg-amber-100/70 border border-amber-300/60 rounded-xl px-4 py-3 text-center">
                  {notice}
                </div>
              )}

              {error && (
                <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full min-h-[48px] py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[16px] font-semibold rounded-xl transition-[background-color,box-shadow] duration-150 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[5px_5px_12px_var(--neu-lo),-5px_-5px_12px_var(--neu-hi)] active:shadow-[inset_3px_3px_6px_rgba(8,51,68,0.45),inset_-3px_-3px_6px_rgba(255,255,255,0.2)]"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <p className="text-center text-[12px] text-[var(--neu-muted)] mt-5">
              Having trouble signing in? Contact the Admin or HR.
            </p>
            </div>
          </div>

          {/* Sliding layer: Attendance Station */}
          <div
            className="neu-dark absolute inset-x-0 top-0 bg-[var(--neu-bg)] shadow-[0_-10px_24px_rgba(163,177,198,0.55)] transition-transform duration-[800ms] ease-in-out"
            style={{
              height: CARD_H - KIOSK_TOP,
              // Curved top only, so no light corners show at the bottom of the card
              borderRadius: "60% 60% 0 0 / 56px 56px 0 0",
              transform: `translateY(${kiosk ? KIOSK_TOP : CARD_H - PEEK}px)`,
            }}
          >
            <button
              type="button"
              onClick={showKiosk}
              tabIndex={kiosk ? -1 : 0}
              className={`slide-title block mx-auto mt-3.5 text-[32px] font-bold text-white tracking-wide transition-transform duration-500 ease-in-out ${kiosk ? "scale-100 cursor-default" : "scale-[0.6] cursor-pointer hover:text-cyan-200"}`}
            >
              Attendance Station
            </button>

            <div
              inert={!kiosk}
              className={`px-6 sm:px-10 pt-3 pb-5 text-center transition-opacity duration-500 ${kiosk ? "opacity-100 delay-300" : "opacity-0"}`}
            >
              <div className={`neu-raised-sm mx-auto w-14 h-14 rounded-2xl flex items-center justify-center ${kioskBlocked ? "text-amber-300" : "text-cyan-300"}`}>
                <LockIcon />
              </div>
              {kioskBlocked ? (
                <>
                  <h2 className="mt-4 text-[19px] font-semibold text-white">Access Restricted</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--neu-muted)]">
                    The Attendance Station can only be opened on a dedicated desktop terminal or kiosk station.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-4 text-[19px] font-semibold text-white">HR Authorization Required</h2>
                  <p className="mt-2 mb-6 text-[13px] leading-relaxed text-[var(--neu-muted)]">
                    Enter the 4-digit HR security PIN to unlock and launch the Attendance Station.
                  </p>
                  <PinEntry key={pinRun} onUnlocked={() => navigate("/attendance-station")} />
                </>
              )}
              <button
                type="button"
                onClick={showLogin}
                className="neu-raised-sm mt-5 w-full min-h-[44px] rounded-xl text-slate-200 hover:text-white active:shadow-[var(--neu-inset-sm)] text-[14px] font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-white/30 mt-5 tracking-wide">© 2026 AT-ICE ERP</p>
      </div>
    </div>
  );
}
