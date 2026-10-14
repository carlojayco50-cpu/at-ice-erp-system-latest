import { useCallback, useEffect, useState } from "react";
import PasswordInput from "./PasswordInput";
import { toast } from "../lib/toast";
import { openProtectedFile } from "../lib/openFile";

// Admin > Settings: the rates and rules the system uses (GET/PUT /api/settings,
// App\Support\Settings) and the Admin override PIN that unlocks a locked
// Attendance Station kiosk. Every change is written to the audit log.

const GROUPS = [
  ["payroll.", "Payroll"],
  ["attendance.", "Attendance"],
  ["leave.", "Leave"],
  ["kiosk.", "Kiosk"],
  ["thirteenth.", "13th month"],
  ["retention.", "Records"],
];

const inputCls = "w-full px-2.5 py-1.5 border border-black/[0.09] rounded-md text-[13px] text-slate-800 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors ? Object.values(data.errors)[0][0] : data?.message || `Request failed (${res.status})`);
  return data;
}

function SettingRow({ s, onSaved }) {
  const [value, setValue] = useState(String(s.value ?? ""));
  const [busy, setBusy] = useState(false);
  const changed = value !== String(s.value ?? "");
  const id = `setting-${s.key}`;

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ key: s.key, value }) });
      toast.success(`${s.label} saved.`);
      onSaved();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  let field;
  if (s.type === "bool") {
    field = (
      <select id={id} value={value} onChange={(e) => setValue(e.target.value)} className={inputCls}>
        <option value="false">No</option>
        <option value="true">Yes</option>
      </select>
    );
  } else if (s.type.startsWith("enum:")) {
    field = (
      <select id={id} value={value} onChange={(e) => setValue(e.target.value)} className={inputCls}>
        {s.type.slice(5).split(",").map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    );
  } else {
    const type = { int: "number", number: "number", date: "date", time: "time" }[s.type] || "text";
    field = (
      <input
        id={id}
        type={type}
        step={s.type === "number" ? "0.01" : undefined}
        min={s.type === "int" || s.type === "number" ? 0 : undefined}
        placeholder={s.type === "month-day" ? "MM-DD" : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 sm:items-center py-2.5 border-b border-black/[0.06] last:border-b-0">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-[12px] text-slate-700">{s.label}</span>
        <span className="block text-[10px] text-slate-400 font-mono">
          {s.key}{String(s.value) !== String(s.default) ? ` · default ${s.default}` : ""}
        </span>
      </label>
      {field}
      <button
        type="button"
        onClick={save}
        disabled={!changed || busy}
        className="px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function OverridePinForm() {
  const [form, setForm] = useState({ current_password: "", admin_pin: "", admin_pin_confirmation: "" });
  const [busy, setBusy] = useState(false);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const ok = form.current_password && /^\d{6}$/.test(form.admin_pin) && form.admin_pin === form.admin_pin_confirmation;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api("/api/admin/kiosk-override-pin", { method: "PUT", body: JSON.stringify(form) });
      toast.success(data.message);
      setForm({ current_password: "", admin_pin: "", admin_pin_confirmation: "" });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-800">Kiosk Admin override PIN</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          A kiosk locked after too many wrong HR PINs stays locked until an Admin types this 6-digit PIN on it. Keep it private.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Your account password</span>
          <PasswordInput autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} className={inputCls} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">New Admin PIN (6 digits)</span>
          <PasswordInput inputMode="numeric" autoComplete="off" maxLength={6} value={form.admin_pin} onChange={(e) => setForm({ ...form, admin_pin: digits(e.target.value) })} className={inputCls} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Confirm Admin PIN</span>
          <PasswordInput inputMode="numeric" autoComplete="off" maxLength={6} value={form.admin_pin_confirmation} onChange={(e) => setForm({ ...form, admin_pin_confirmation: digits(e.target.value) })} className={inputCls} required />
        </label>
      </div>
      <button type="submit" disabled={!ok || busy} className="self-start px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50">
        {busy ? "Saving…" : "Save Admin PIN"}
      </button>
    </form>
  );
}

// Holiday and overtime pay rates (pay_multipliers, R3). A change is a new rate
// from a date; older payrolls keep the rate of their day.
const RATE_LABELS = {
  REGULAR_HOLIDAY_WORKED: "Regular holiday, worked",
  REGULAR_HOLIDAY_UNWORKED: "Regular holiday, not worked",
  SPECIAL_HOLIDAY_WORKED: "Special (non-working) holiday, worked",
  SPECIAL_HOLIDAY_UNWORKED: "Special (non-working) holiday, not worked",
  SPECIAL_WORKING_DAY_WORKED: "Special working day, worked",
  OT_ORDINARY: "Overtime, ordinary day",
  OT_SPECIAL_HOLIDAY: "Overtime, special holiday",
  OT_REGULAR_HOLIDAY: "Overtime, regular holiday",
  REGULAR_HOLIDAY_REST_DAY: "Regular holiday on a rest day",
  DOUBLE_HOLIDAY: "Double holiday",
};
function PayRates() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState({});
  const [from, setFrom] = useState(new Date().toLocaleDateString("en-CA"));
  const load = useCallback(() => { api("/api/pay-multipliers").then(setRows).catch((e) => toast.error(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (key) => {
    try {
      const res = await api("/api/pay-multipliers", { method: "POST", body: JSON.stringify({ key, value: Number(draft[key]), effective_date: from }) });
      toast.success(res.message);
      setDraft((d) => ({ ...d, [key]: undefined }));
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <div className="bg-white border border-black/[0.09] rounded-xl p-[18px]">
      <h2 className="text-[15px] font-semibold text-slate-800">Holiday and overtime pay rates</h2>
      <p className="text-[12px] text-slate-500 mt-0.5">x the hourly rate. Client defaults; the DOLE rate is in each note. A change applies from the date below.</p>
      <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">New rates apply from
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} />
      </label>
      {(rows || []).map((r) => (
        <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_auto] gap-2 sm:items-center py-2.5 border-b border-black/[0.06] last:border-b-0">
          <div className="min-w-0">
            <span className="block text-[12px] text-slate-700">{RATE_LABELS[r.key] || r.key} <span className="font-mono text-slate-400">({r.value.toFixed(2)})</span></span>
            <span className="block text-[10px] text-slate-400">{r.history[r.history.length - 1]?.note}</span>
          </div>
          <input type="number" step="0.01" min="0" max="10" aria-label={RATE_LABELS[r.key]} value={draft[r.key] ?? r.value} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} className={inputCls} />
          <button type="button" onClick={() => save(r.key)} disabled={draft[r.key] === undefined || Number(draft[r.key]) === r.value}
            className="px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-40">Save</button>
        </div>
      ))}
    </div>
  );
}

// Records past the retention period (retention.years). Nothing is deleted on
// its own: for each record Admin downloads the CSV, keeps it, or deletes it.
function RetentionReview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { api("/api/retention-review").then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, kind, ref, label) => {
    if (action === "delete" && !window.confirm(`Delete ${label} for good? Download the CSV first if you need it.`)) return;
    if (action === "anonymize" && !window.confirm(`Remove ${label}'s name, contact details, address, face and documents? The employee ID and pay history stay.`)) return;
    try {
      const res = await api(`/api/retention-review/${action}`, { method: "POST", body: JSON.stringify({ kind, ref }) });
      toast.success(res.message);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const today = new Date().toLocaleDateString("en-CA");
  const btn = "px-2.5 py-1 rounded-md border border-black/[0.09] text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer";

  const rows = [
    ...(data?.employees || []).map((e) => ({
      key: `e${e.id}`, kind: "employee", ref: e.id, label: `${e.employee_id} ${e.name}`,
      note: `Inactive since ${e.deactivated_at} · ${e.attendance_count} attendance record(s)`,
      csv: `/api/attendances/export?from=2000-01-01&to=${today}&employee_id=${e.id}`, file: `attendance-${e.employee_id}.csv`,
    })),
    ...(data?.attendance_years || []).map((y) => ({
      key: `y${y.year}`, kind: "attendance_year", ref: y.year, label: `Attendance from ${y.year}`, note: `${y.count} record(s)`,
      csv: `/api/attendances/export?from=${y.year}-01-01&to=${y.year}-12-31`, file: `attendance-${y.year}.csv`,
    })),
  ];

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl p-[18px]">
      <h2 className="text-[15px] font-semibold text-slate-800">Records past {data?.retention_years ?? 2} years</h2>
      <p className="text-[12px] text-slate-500 mt-0.5">
        {data?.expiry_action && data.expiry_action !== "REVIEW"
          ? `Inactive employees past this period are ${data.expiry_action === "PURGE" ? "deleted" : "anonymized"} each day (Archive expiry action). Attendance years are only removed by Admin.`
          : "Nothing is deleted on its own. For each record: download the CSV, keep it for another period, anonymize it, or delete it."}
      </p>
      {error && <p role="alert" className="mt-3 text-[12px] text-red-600">{error}</p>}
      {data && rows.length === 0 && <p className="mt-3 text-[12px] text-slate-400">No records are past the retention period.</p>}
      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-black/[0.06] text-[12px]">
            <span className="font-medium text-slate-800">{r.label}</span>
            <span className="text-slate-400">{r.note}</span>
            <span className="flex-1" />
            <button type="button" className={btn} onClick={() => openProtectedFile(r.csv, r.file)}>Download CSV</button>
            <button type="button" className={btn} onClick={() => act("keep", r.kind, r.ref, r.label)}>Keep</button>
            {r.kind === "employee" && <button type="button" className={btn} onClick={() => act("anonymize", r.kind, r.ref, r.label)}>Anonymize</button>}
            <button type="button" className="px-2.5 py-1 rounded-md border border-red-200 text-[11px] text-red-600 hover:bg-red-50 cursor-pointer" onClick={() => act("delete", r.kind, r.ref, r.label)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SystemSettings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/settings").then(setSettings).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="bg-white border border-black/[0.09] rounded-xl p-[18px]">
        <h2 className="text-[15px] font-semibold text-slate-800">Rates and rules</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">Used by attendance, leave and payroll. Each change is recorded in the audit log.</p>
        {error && <p role="alert" className="mt-3 text-[12px] text-red-600">{error}</p>}
        {!settings && !error && <p className="mt-3 text-[12px] text-slate-400">Loading…</p>}
        {settings && GROUPS.map(([prefix, title]) => {
          const rows = settings.filter((s) => s.key.startsWith(prefix));
          return rows.length ? (
            <section key={prefix} className="mt-4">
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">{title}</h3>
              {rows.map((s) => <SettingRow key={`${s.key}:${s.value}`} s={s} onSaved={load} />)}
            </section>
          ) : null;
        })}
      </div>
      <PayRates />
      <OverridePinForm />
      <RetentionReview />
    </div>
  );
}
