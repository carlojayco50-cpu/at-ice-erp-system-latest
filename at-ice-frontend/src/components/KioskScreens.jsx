import { useEffect, useRef, useState } from "react";
import { getKioskDeviceId, setKioskToken } from "../lib/kiosk";
import { playSplash } from "../lib/splash";
import { Icon } from "./icons";

// Screens of the Attendance Station gate (see KioskGate.jsx).
// Dark soft UI (neumorphism.css, .neu-dark): raised card and icon badge, cyan accent.

const WarningIcon = () => (
  <Icon name="warning" size={28} className="!text-red-500" />
);

const CameraOffIcon = () => (
  <Icon name="cameraOff" size={28} />
);

const LockIcon = () => (
  <Icon name="lock" size={28} />
);

const BADGE_TONES = {
  warning: "text-amber-300",
  danger: "text-red-300",
  info: "text-cyan-300",
};

function KioskShell({ tone = "warning", icon, title, children }) {
  return (
    <div className="neu-dark min-h-[100dvh] w-full bg-[var(--neu-bg)] flex items-center justify-center p-4">
      <div className="neu-raised w-full max-w-md rounded-[28px] p-7 sm:p-8 text-center">
        <div className={`neu-raised-sm mx-auto w-16 h-16 rounded-2xl flex items-center justify-center ${BADGE_TONES[tone]}`}>
          {icon}
        </div>
        <h1 className="mt-5 text-[22px] font-semibold text-white leading-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const primaryBtn =
  "w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[14px] font-semibold transition-[background-color,box-shadow] shadow-[4px_4px_10px_var(--neu-lo),-4px_-4px_10px_var(--neu-hi)] active:shadow-[inset_3px_3px_6px_rgba(8,51,68,0.45)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const ghostBtn =
  "neu-raised-sm w-full min-h-[44px] px-4 py-2 rounded-xl text-cyan-200 hover:text-cyan-100 active:shadow-[var(--neu-inset-sm)] text-[13px] font-medium transition-[color,box-shadow] cursor-pointer";

export function KioskLoading() {
  return (
    <div className="neu-dark min-h-[100dvh] w-full bg-[var(--neu-bg)] flex items-center justify-center" aria-busy="true">
      <span className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

export function AccessRestrictedScreen({ onReturn }) {
  return (
    <KioskShell tone="warning" icon={<WarningIcon />} title="Access Restricted">
      <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
        The Attendance Station can only be accessed using a dedicated desktop terminal or kiosk station.
      </p>
      <button type="button" onClick={onReturn} className={`${primaryBtn} mt-6`}>
        Back to Login
      </button>
    </KioskShell>
  );
}

// status "none": no camera found. status "error": the check itself failed.
export function NoCameraScreen({ status, message, onRetry, onReturn }) {
  const failed = status === "error";
  return (
    <KioskShell tone="danger" icon={<CameraOffIcon />} title={failed ? "Hardware Check Failed" : "No Camera Detected"}>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
        {failed
          ? message || "The camera check could not be completed."
          : "Facial recognition requires an active webcam connected to this terminal."}
      </p>
      <button type="button" onClick={onRetry} className={`${primaryBtn} mt-6`}>
        Retry Hardware Check
      </button>
      <button type="button" onClick={onReturn} className={`${ghostBtn} mt-3`}>
        Back to Login
      </button>
    </KioskShell>
  );
}

// Shown when the server cannot be reached while the gate checks the saved kiosk token.
export function KioskOfflineScreen({ onRetry, onReturn }) {
  return (
    <KioskShell tone="warning" icon={<WarningIcon />} title="Cannot Reach the Server">
      <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
        Check the network connection of this terminal, then try again.
      </p>
      <button type="button" onClick={onRetry} className={`${primaryBtn} mt-6`}>
        Try Again
      </button>
      <button type="button" onClick={onReturn} className={`${ghostBtn} mt-3`}>
        Back to Login
      </button>
    </KioskShell>
  );
}

// Four PIN boxes over one real input (so paste, backspace and number pads just
// work). The PIN is sent as soon as the 4th digit is typed; there is no submit
// button. The PIN is only ever checked by the backend. Used by PinModal and by
// the Attendance Station panel of the login page.
export function PinEntry({ onUnlocked }) {
  const inputRef = useRef(null);
  const [pin, setPin] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [loading, setLoading] = useState(false);
  // Locked after too many wrong PINs: no time limit, only the Admin PIN unlocks it.
  const [lockedOut, setLockedOut] = useState(false);

  useEffect(() => {
    fetch(`/api/kiosk/lock-state?device_id=${encodeURIComponent(getKioskDeviceId())}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.locked) setLockedOut(true); })
      .catch(() => { /* checked again on the next PIN */ });
  }, []);

  // A disabled input loses focus: give it back after each check and lockout.
  useEffect(() => {
    if (!loading && !lockedOut) inputRef.current?.focus({ preventScroll: true });
  }, [loading, lockedOut]);

  function handleChange(e) {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(value);
    if (value.length > 0 && !lockedOut) setError("");
    if (value.length === 4) submit(value);
  }

  async function submit(pin) {
    if (loading || lockedOut) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kiosk/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pin, device_id: getKioskDeviceId() }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.token) {
        setKioskToken(data.token);
        playSplash();
        onUnlocked();
        return;
      }
      if (res.status === 423) {
        setLockedOut(true);
        setError("");
      } else if (res.status === 422 && typeof data?.attempts_remaining === "number") {
        setError(`Wrong PIN. ${data.attempts_remaining} attempt${data.attempts_remaining === 1 ? "" : "s"} left before this kiosk locks.`);
      } else {
        setError(data?.message || "The PIN could not be checked. Please try again.");
      }
      setPin("");
      setShake((n) => n + 1);
    } catch {
      setError("Network error. Check the connection of this terminal and try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  const active = focused && !loading && !lockedOut ? Math.min(pin.length, 3) : -1;

  if (lockedOut) return <AdminOverride onUnlocked={() => { setLockedOut(false); setError(""); }} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto">
        {/* key restarts the shake on every wrong PIN without remounting the input */}
        <div key={shake} className={`grid grid-cols-4 gap-3 ${shake ? "pin-shake" : ""}`}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pin.length;
            return (
              <div
                key={i}
                aria-hidden="true"
                className={`pin-box ${i === active ? "pin-active" : ""} ${error && !lockedOut && i !== active ? "pin-error" : ""} w-14 h-16 rounded-xl border flex items-center justify-center bg-slate-950/70 transition-all duration-150 ${
                  i === active
                    ? "border-cyan-400 shadow-[0_0_0_3px_rgba(34,211,238,0.18),0_0_18px_rgba(34,211,238,0.25)]"
                    : error && !lockedOut
                      ? "border-red-400/50"
                      : filled
                        ? "border-cyan-500/50"
                        : "border-slate-600/60"
                } ${loading || lockedOut ? "opacity-50" : ""}`}
              >
                {filled && <span className="w-3 h-3 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)] pin-dot" />}
                {i === active && !filled && <span className="w-[2px] h-6 bg-cyan-300 pin-caret" />}
              </div>
            );
          })}
        </div>
        <label htmlFor="kiosk-pin" className="sr-only">HR security PIN, 4 digits</label>
        <input
          ref={inputRef}
          id="kiosk-pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          disabled={loading || lockedOut}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer caret-transparent"
        />
      </div>

      <div className="min-h-[24px] flex items-center justify-center" aria-live="polite">
        {loading && (
          <span className="flex items-center gap-2 text-[13px] text-cyan-200">
            <span className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-300 rounded-full animate-spin" />
            Checking PIN…
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="text-[13px] text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3 text-center">
          {error}
        </div>
      )}
    </div>
  );
}

// A kiosk locked after too many wrong HR PINs. It stays locked (no timer) until
// an Admin types the 6-digit Admin override PIN here, on this kiosk. HR cannot
// unlock it. Every try is logged on the server.
function AdminOverride({ onUnlocked }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/kiosk/override", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ device_id: getKioskDeviceId(), admin_pin: pin }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        onUnlocked();
        return;
      }
      setError(res.status === 429 ? "Too many tries. Wait a minute and try again." : data?.message || "The Admin PIN could not be checked.");
      setPin("");
    } catch {
      setError("Network error. Check the connection of this terminal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-center">
      <div role="alert" className="text-[13px] text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3">
        This kiosk is locked after too many wrong PINs. Only an Admin can unlock it, here on this kiosk.
      </div>
      <label htmlFor="kiosk-admin-pin" className="text-[12px] text-slate-300">Admin override PIN (6 digits)</label>
      <input
        id="kiosk-admin-pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        className="mx-auto w-48 text-center tracking-[0.5em] font-mono text-[20px] px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-600/60 text-cyan-100 outline-none focus:border-cyan-400"
        autoFocus
      />
      {error && <div role="alert" className="text-[13px] text-red-300">{error}</div>}
      <button type="submit" disabled={pin.length !== 6 || busy} className="mx-auto px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-900 text-[14px] font-semibold disabled:opacity-50 cursor-pointer">
        {busy ? "Checking…" : "Unlock kiosk"}
      </button>
    </form>
  );
}

// Full-screen PIN prompt of the Attendance Station gate (direct visits and relocks).
export function PinModal({ onUnlocked, onCancel }) {
  return (
    <KioskShell tone="info" icon={<LockIcon />} title="HR Authorization Required">
      <p className="mt-3 mb-6 text-[14px] leading-relaxed text-slate-300">
        Enter the 4-digit HR security PIN to launch the Attendance Station.
      </p>
      <PinEntry onUnlocked={onUnlocked} />
      <button type="button" onClick={onCancel} className={`${ghostBtn} mt-3`}>
        Cancel
      </button>
    </KioskShell>
  );
}
