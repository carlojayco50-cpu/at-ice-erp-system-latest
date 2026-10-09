import { useCallback, useEffect, useState } from "react";
import HrLayout from "../../components/HrLayout";
import PasswordInput from "../../components/PasswordInput";

const token = () => localStorage.getItem("token") || "";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(firstError || data?.message || `Request failed (${res.status}).`);
  }
  return data;
}

const inputCls =
  "w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500";

const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function Notice({ tone, children }) {
  const cls = tone === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return <div className={`px-3 py-2 rounded-lg border text-[12px] ${cls}`}>{children}</div>;
}

export default function KioskPinPage() {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [pinForm, setPinForm] = useState({ current_password: "", pin: "", pin_confirmation: "" });
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState(null); // { tone, text }

  const [clearPassword, setClearPassword] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api("/api/hr/kiosk-pin"));
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const pinValid = /^\d{4}$/.test(pinForm.pin);
  const mismatch = pinForm.pin_confirmation.length > 0 && pinForm.pin !== pinForm.pin_confirmation;
  const canSave = pinForm.current_password && pinValid && pinForm.pin === pinForm.pin_confirmation;

  async function savePin(e) {
    e.preventDefault();
    setPinSaving(true);
    setPinMsg(null);
    try {
      const data = await api("/api/hr/kiosk-pin", { method: "PUT", body: JSON.stringify(pinForm) });
      setPinMsg({ tone: "ok", text: data.message });
      setPinForm({ current_password: "", pin: "", pin_confirmation: "" });
      loadStatus();
    } catch (err) {
      setPinMsg({ tone: "error", text: err.message });
    } finally {
      setPinSaving(false);
    }
  }

  async function clearLockout(e) {
    e.preventDefault();
    setClearing(true);
    setClearMsg(null);
    try {
      const data = await api("/api/hr/kiosk-pin/clear-lockout", {
        method: "POST",
        body: JSON.stringify({ current_password: clearPassword }),
      });
      setClearMsg({ tone: "ok", text: data.message });
      setClearPassword("");
      loadStatus();
    } catch (err) {
      setClearMsg({ tone: "error", text: err.message });
    } finally {
      setClearing(false);
    }
  }

  return (
    <HrLayout pageTitle="Kiosk PIN" breadcrumb="HRIS / Kiosk PIN">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">

        {/* Status */}
        <div className="lg:col-span-2 bg-white border border-black/[0.09] rounded-xl p-[18px]">
          <h2 className="text-[15px] font-semibold text-slate-800">Attendance Station security</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            A terminal needs this 4-digit PIN before it can open the Attendance Station.
          </p>
          {loadError && <div className="mt-3"><Notice tone="error">{loadError}</Notice></div>}
          {status && (
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
              <div className="rounded-lg bg-slate-50 border border-black/[0.06] px-3 py-2">
                <dt className="text-slate-400">PIN</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {status.pin_set ? "Set" : "Not set (every kiosk is locked)"}
                </dd>
                {status.pin_set && status.pin_changed_at && (
                  <dd className="text-slate-400 mt-0.5">
                    Changed {fmtDateTime(status.pin_changed_at)}{status.pin_changed_by ? ` by ${status.pin_changed_by}` : ""}
                  </dd>
                )}
              </div>
              <div className="rounded-lg bg-slate-50 border border-black/[0.06] px-3 py-2">
                <dt className="text-slate-400">Unlocked terminals</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{status.unlocked_kiosks}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 border border-black/[0.06] px-3 py-2">
                <dt className="text-slate-400">Lockout</dt>
                <dd className={`mt-0.5 font-medium ${status.locked_out ? "text-red-600" : "text-slate-800"}`}>
                  {status.locked_out ? "Active (too many wrong PINs)" : "None"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Set or change the PIN */}
        <form onSubmit={savePin} className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">{status?.pin_set ? "Change PIN" : "Set PIN"}</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {status?.pin_set
                ? "After a change, every unlocked terminal is locked again and must be unlocked with the new PIN."
                : "Choose the first PIN. Until it is set, no terminal can open the Attendance Station."}
            </p>
          </div>

          {pinMsg && <Notice tone={pinMsg.tone}>{pinMsg.text}</Notice>}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Your account password</span>
            <PasswordInput
              autoComplete="current-password"
              value={pinForm.current_password}
              onChange={(e) => setPinForm({ ...pinForm, current_password: e.target.value })}
              className={inputCls}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">New PIN (4 digits)</span>
            <PasswordInput
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pinForm.pin}
              onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              className={inputCls}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Confirm new PIN</span>
            <PasswordInput
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pinForm.pin_confirmation}
              onChange={(e) => setPinForm({ ...pinForm, pin_confirmation: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              className={inputCls}
              required
            />
            {mismatch && <span className="text-[10px] text-red-500">The PINs do not match.</span>}
          </label>

          <button
            type="submit"
            disabled={!canSave || pinSaving}
            className="self-start px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50"
          >
            {pinSaving ? "Saving…" : status?.pin_set ? "Change PIN" : "Set PIN"}
          </button>
        </form>

        {/* Clear a lockout */}
        <form onSubmit={clearLockout} className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-3 self-start">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Clear lockout</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              After 5 wrong PINs a terminal is locked out for 15 minutes. Clear it here if the right person is locked out.
            </p>
          </div>

          {clearMsg && <Notice tone={clearMsg.tone}>{clearMsg.text}</Notice>}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Your account password</span>
            <PasswordInput
              autoComplete="current-password"
              value={clearPassword}
              onChange={(e) => setClearPassword(e.target.value)}
              className={inputCls}
              required
            />
          </label>

          <button
            type="submit"
            disabled={!clearPassword || clearing}
            className="self-start px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-700 hover:bg-slate-50 text-[12px] font-medium disabled:opacity-50"
          >
            {clearing ? "Clearing…" : "Clear lockout"}
          </button>
        </form>
      </div>
    </HrLayout>
  );
}
