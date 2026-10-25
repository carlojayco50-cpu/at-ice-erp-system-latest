import { useCallback, useEffect, useState } from "react";
import HrLayout from "../../components/HrLayout";
import PasswordInput from "../../components/PasswordInput";
import { toast } from "../../lib/toast";
import { formatDateTime } from "../../lib/time";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { TipsWidget } from "../../components/Insight";

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
  v ? formatDateTime(v) : "";

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

  return (
    <HrLayout pageTitle="Kiosk PIN" breadcrumb="HRIS / Kiosk PIN">
      {/* Status */}
      {loadError && <Notice tone="error">{loadError}</Notice>}
      <KpiGrid cols={4}>
        <KpiCard label="Kiosk PIN" icon="key" tone={status?.pin_set ? "emerald" : "rose"} value={!status ? "…" : status.pin_set ? "Set" : "Not set"}
          sub={!status ? "Loading" : status.pin_set && status.pin_changed_at ? `Changed ${fmtDateTime(status.pin_changed_at)}${status.pin_changed_by ? ` by ${status.pin_changed_by}` : ""}` : "Every kiosk is locked until it is set"} />
        <KpiCard label="Unlocked terminals" icon="check" tone="cyan" value={status ? Number(status.unlocked_kiosks || 0) : "…"} sub="Can record Time In and Time Out" live={Number(status?.unlocked_kiosks || 0) > 0} />
        <KpiCard label="Locked kiosks" icon="alert" tone={status?.locked_kiosks?.length ? "rose" : "emerald"} value={status ? (status.locked_kiosks?.length || 0) : "…"} sub={status?.locked_kiosks?.length ? "Need the Admin override PIN" : "None locked"} />
        <KpiCard label="Who can unlock" icon="shield" tone="violet" value={status?.can_unlock ? "HR & Admin" : "Admin"} sub="A locked kiosk, after 5 wrong PINs" />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">

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

        {/* Locked kiosks: only Admin can unlock them, on the kiosk itself */}
        <div className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-3 self-start">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Locked kiosks</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              After 5 wrong PINs in a row a kiosk stays locked until an Admin types the Admin override PIN on that kiosk{status?.can_unlock ? " or unlocks it here" : ". HR cannot unlock it"}. HR and Admin are notified when a kiosk locks.
            </p>
          </div>
          {!status?.locked_kiosks?.length ? (
            <p className="text-[12px] text-slate-400">No kiosk is locked.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {status.locked_kiosks.map((k) => (
                <li key={k.kiosk + k.locked_at} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px]">
                  <span className="font-mono font-semibold text-red-700">Kiosk {k.kiosk}</span>
                  <span className="text-red-600">Locked {fmtDateTime(k.locked_at)}{k.ip ? ` · ${k.ip}` : ""}</span>
                  {status.can_unlock && (
                    <button type="button" onClick={async () => {
                      try { toast.success((await api(`/api/kiosk-devices/${k.id}/unlock`, { method: "POST" })).message); loadStatus(); }
                      catch (e) { toast.error(e.message); }
                    }} className="px-2.5 py-1 rounded-md bg-white border border-red-300 text-red-700 font-semibold hover:bg-red-100 cursor-pointer">Unlock</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <TipsWidget title="How the kiosk stays safe" tips={[
          { title: "Change the PIN after a staff change", text: "Every unlocked terminal locks again and needs the new PIN.", tone: "cyan", icon: "key" },
          { title: "Five wrong PINs lock a kiosk", text: "HR and Admin get a notice and an email with the kiosk, time and IP.", tone: "rose", icon: "alert" },
          { title: "Kiosks are for computers", text: "Phones and tablets cannot open the Attendance Station; it also needs a working camera.", tone: "violet", icon: "shield" },
        ]} />
      </div>
    </HrLayout>
  );
}
