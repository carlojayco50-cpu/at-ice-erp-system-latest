// src/pages/Admin/PayrollRecordsPage.jsx
//
// Admin Payroll Records (docs/REVIEW-DECISIONS.md). HR approves each
// employee's timesheet for a pay period (HR > Timesheets), which makes the
// payroll; Admin pays it here:
//   - pick the pay period (start and end are fixed), filter All / Unpaid / Paid,
//     search by employee ID
//   - add earnings (bonus, incentive, referral bonus; taxable or not)
//   - tick and mark paid (final, logged)
//   - print the payslip (PDF from the print dialog)
//   - 13th month pay per employee for a year
// Salary is confidential: there are no totals or summary cards.

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { payPeriodLabel } from "../../lib/payPeriod";
import { PRINT_BASE_CSS, printDocument } from "../../lib/printDocument";
import { COMPANY } from "../../lib/company";

const token = () => localStorage.getItem("token") || "";
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors ? Object.values(data.errors).flat()[0] : data?.message || `Request failed (${res.status})`);
  return data;
}
const todayLocal = () => new Date().toLocaleDateString("en-CA");
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const peso = (v) => `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (v) => Number(v || 0);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function printPayslip(p) {
  const e = p.employee || {};
  const line = (label, value, minus) => (n(value) ? `<tr><td>${esc(label)}</td><td class="amt">${minus ? "−" : ""}${peso(value)}</td></tr>` : "");
  const earnings = [
    line(`Basic pay (${p.pay_basis === "monthly" ? `monthly ${peso(p.monthly_rate)}` : `${n(p.days_present)} day(s) × ${peso(p.daily_rate)}`})`, p.basic_pay),
    line(`Paid leave (${n(p.paid_leave_days)} day(s))`, p.paid_leave_pay),
    line(`Holiday pay (${n(p.holiday_hours)} h)`, p.holiday_pay),
    line("Holiday overtime", p.holiday_ot_pay),
    line(`Overtime (${n(p.ot_hours)} h approved)`, p.overtime_pay),
    ...(p.adjustments || []).map((a) => line(`${a.label}${a.taxable ? "" : " (non-taxable)"}`, a.amount)),
  ].join("");
  const deductions = [
    line(`Late (${n(p.late_minutes)} min)`, p.late_deduction, true),
    line(`Absences (${n(p.absent_days)} day(s))`, p.absence_deduction, true),
    line(`Unpaid leave (${n(p.unpaid_leave_days)} day(s)${n(p.unpaid_leave_hours) ? ` + ${n(p.unpaid_leave_hours)} h` : ""})`, p.leave_deduction, true),
    line("SSS", p.sss_deduction, true),
    line("PhilHealth", p.philhealth_deduction, true),
    line("Pag-IBIG", p.pagibig_deduction, true),
    line("Withholding tax", p.tax_deduction, true),
    line("Shortfall from the previous cut-off", p.carry_over_in, true),
  ].join("");
  printDocument(`<!doctype html><html><head><title>Payslip ${esc(e.employee_id)} ${esc(p.period_start)}</title><style>${PRINT_BASE_CSS}
    body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
    .head { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 18px; } .muted { color: #475569; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 4px; color: #334155; }
    td { padding: 4px 0; border-bottom: 1px solid #e2e8f0; } .amt { text-align: right; font-family: monospace; }
    .net td { font-size: 15px; font-weight: bold; border-top: 2px solid #0f172a; border-bottom: 0; padding-top: 8px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
  </style></head><body><div class="sheet">
    <div class="head"><div><h1>${esc(COMPANY?.name || "AT-ICE")}</h1><div class="muted">Payslip</div></div>
      <div class="title" style="text-align:right"><b>${esc(payPeriodLabel({ start: p.period_start, end: p.period_end }))}</b><div class="muted">Pay day ${esc(p.pay_day || "")}</div></div></div>
    <div class="info"><div><b>${esc(e.full_name || "")}</b></div><div>Employee ID: <b>${esc(e.employee_id || "")}</b></div>
      <div class="muted">${esc(e.position || "")}</div><div class="muted">Status: ${p.status === "paid" ? "Paid" : "Unpaid (approved)"}</div></div>
    <h2>Earnings</h2><table>${earnings}</table>
    <h2>Deductions</h2><table>${deductions || '<tr><td class="muted">None</td><td></td></tr>'}</table>
    <table><tr class="net"><td>Net pay</td><td class="amt">${peso(p.net_pay)}</td></tr></table>
    ${n(p.carry_over_out) ? `<p>Deductions were ${peso(p.carry_over_out)} more than the pay; this is deducted on the next cut-off.</p>` : ""}
    ${n(p.employer_shouldered) ? `<p>Deductions were ${peso(p.employer_shouldered)} more than the pay; the employer pays this.</p>` : ""}
    <p class="muted" style="margin-top:18px">Gross ${peso(p.gross_pay)} · Taxable income ${peso(p.taxable_income)} · Hourly rate ${peso(p.hourly_rate)}</p>
  </div></body></html>`);
}

function AdjustModal({ payroll, onClose, onChanged }) {
  const [form, setForm] = useState({ label: "Bonus", amount: "", taxable: true });
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/payrolls/${payroll.id}/adjustments`, { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      toast.success(`${form.label} added.`);
      setForm({ label: "Bonus", amount: "", taxable: true });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a) => {
    try {
      await api(`/api/payroll-adjustments/${a.id}`, { method: "DELETE" });
      toast.success(`${a.label} removed.`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="Earnings adjustments" className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-slate-800">Earnings adjustments</div>
        <ul className="flex flex-col gap-1">
          {(payroll.adjustments || []).length === 0 && <li className="text-slate-400">None yet.</li>}
          {(payroll.adjustments || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-50">
              <span>{a.label} {a.taxable ? "" : <span className="text-slate-400">(non-taxable)</span>}</span>
              <span className="flex items-center gap-2 font-mono">{peso(a.amount)}<button onClick={() => remove(a)} className="text-red-600 cursor-pointer">Remove</button></span>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid grid-cols-2 gap-2">
          <select aria-label="Kind" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="px-2 py-1.5 border border-black/[0.09] rounded-md">
            {["Bonus", "Incentive", "Referral bonus", "Allowance", "Other earning"].map((l) => <option key={l}>{l}</option>)}
          </select>
          <input aria-label="Amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="px-2 py-1.5 border border-black/[0.09] rounded-md" />
          <label className="flex items-center gap-2 col-span-2"><input type="checkbox" data-native checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} /> Taxable</label>
          <button type="submit" disabled={busy || !form.amount} className="col-span-2 px-3 py-1.5 rounded-md bg-cyan-500 text-white font-semibold disabled:opacity-50 cursor-pointer">{busy ? "Adding…" : "Add earning"}</button>
        </form>
        <button onClick={onClose} className="self-end text-slate-500 cursor-pointer">Close</button>
      </div>
    </div>
  );
}

function ThirteenthMonth() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  useEffect(() => { api(`/api/thirteenth-month?year=${year}`).then(setData).catch((e) => toast.error(e.message)); }, [year]);
  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
      <div className="px-[18px] py-3 border-b border-black/[0.09] flex flex-wrap items-center gap-3 text-xs">
        <div className="text-[13px] font-semibold text-slate-800">13th month pay</div>
        <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-2 py-1 border border-black/[0.09] rounded-md">
          {[0, 1, 2].map((i) => new Date().getFullYear() - i).map((y) => <option key={y}>{y}</option>)}
        </select>
        <span className="text-slate-400">(Basic earned − unpaid absences, leave and tardiness) ÷ 12 · credit date {data?.credit_date || "—"}</span>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-slate-400 border-b border-black/[0.09]">
          <th className="px-[18px] py-2.5 font-medium">Employee ID</th><th className="px-3 py-2.5 font-medium">Name</th>
          <th className="px-3 py-2.5 font-medium text-right">Basic earned</th><th className="px-3 py-2.5 font-medium text-right">Unpaid deductions</th>
          <th className="px-3 py-2.5 font-medium text-right">13th month</th></tr></thead>
        <tbody>
          {(data?.rows || []).map((r) => (
            <tr key={r.id} className="border-b border-black/[0.06] last:border-b-0">
              <td className="px-[18px] py-2.5 font-mono text-slate-600">{r.employee_id}</td><td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5 text-right font-mono">{peso(r.basic)}</td><td className="px-3 py-2.5 text-right font-mono">{peso(r.deductions)}</td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold">{peso(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PayrollRecordsPage() {
  const [view, setView] = useState("records");
  const [date, setDate] = useState(() => addDays(todayLocal(), -14));
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [adjusting, setAdjusting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api(`/api/payroll-records?date=${date}`);
      setData(d);
      setAdjusting((cur) => (cur ? d.rows.find((r) => r.payroll?.id === cur.id)?.payroll || null : null));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);
  const live = useLiveTick(["payroll"]);
  useEffect(() => { load(); }, [load, live]);
  useEffect(() => { setSelected(new Set()); }, [date]);

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.rows || [])
    .filter((r) => status === "all" || r.payroll?.status === status)
    .map((r) => [r, !q ? 1 : String(r.employee_id).toLowerCase().includes(q) ? 2 : r.name.toLowerCase().includes(q) ? 1 : 0])
    .filter(([, rank]) => rank > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r), [data, status, q]);
  const payable = rows.filter((r) => r.payroll?.status === "unpaid");
  const allOn = payable.length > 0 && payable.every((r) => selected.has(r.payroll.id));
  const toggle = (id) => setSelected((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  const markPaid = async () => {
    if (!window.confirm(`Mark ${selected.size} payroll${selected.size === 1 ? "" : "s"} as paid? Paid is final.`)) return;
    setBusy(true);
    try {
      const res = await api("/api/payrolls/mark-paid", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      toast.success(res.message);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openPayslip = async (payroll) => {
    try {
      printPayslip(await api(`/api/payrolls/${payroll.id}/payslip`));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const period = data?.period;
  return (
    <AdminLayout pageTitle="Payroll" breadcrumb="HRIS / Payroll">
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl self-start" role="group" aria-label="View">
        {[["records", "Payroll Records"], ["thirteenth", "13th Month"]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer ${view === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {view === "thirteenth" ? <ThirteenthMonth /> : (
        <>
          <div className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous pay period" disabled={!period} onClick={() => setDate(addDays(period.start, -1))} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer">‹</button>
              <span className="px-3 py-1.5 rounded-md bg-slate-50 border border-black/[0.06] text-xs text-slate-700 font-medium min-w-[180px] text-center" title="Start and end are fixed by the pay period">{period ? payPeriodLabel(period) : "…"}</span>
              <button type="button" aria-label="Next pay period" disabled={!period} onClick={() => setDate(addDays(period.end, 1))} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer">›</button>
              <input type="date" aria-label="Go to the pay period of a date" onChange={(e) => e.target.value && setDate(e.target.value)} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500" />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter by status">
              {[["all", "All"], ["unpaid", "Unpaid (Approved)"], ["paid", "Paid"]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${status === k ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-500"}`}>{l}</button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee ID or name" aria-label="Search by employee ID or name" className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs w-full sm:w-52" />
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400">Pay day {period?.pay_day || "—"} · SSS, PhilHealth, Pag-IBIG this pay day: {data ? `${Math.round(data.gov_share * 100)}%` : "—"}</span>
            <button type="button" onClick={markPaid} disabled={selected.size === 0 || busy} className="px-3.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer">
              {busy ? "Saving…" : `Mark ${selected.size || ""} paid`}
            </button>
          </div>

          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            {loading ? <SkeletonList /> : error ? (
              <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
            ) : rows.length === 0 ? (
              <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No records match.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                      <th className="px-[18px] py-2.5"><input type="checkbox" data-native aria-label="Select all unpaid" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(payable.map((r) => r.payroll.id)))} /></th>
                      <th className="px-3 py-2.5 font-medium">Employee ID</th>
                      <th className="px-3 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 font-medium text-right">Basic</th>
                      <th className="px-3 py-2.5 font-medium text-right">Holiday / OT</th>
                      <th className="px-3 py-2.5 font-medium text-right">Late / absence / leave</th>
                      <th className="px-3 py-2.5 font-medium text-right">SSS · PhilHealth · Pag-IBIG</th>
                      <th className="px-3 py-2.5 font-medium text-right">Tax</th>
                      <th className="px-3 py-2.5 font-medium text-right">Earnings</th>
                      <th className="px-3 py-2.5 font-medium text-right">Net pay</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const p = r.payroll;
                      return (
                        <tr key={r.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                          <td className="px-[18px] py-2.5">{p?.status === "unpaid" && <input type="checkbox" data-native aria-label={`Select ${r.employee_id}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600">{r.employee_id}</td>
                          <td className="px-3 py-2.5 text-slate-800 font-medium whitespace-nowrap">{r.name}</td>
                          {p ? (
                            <>
                              <td className="px-3 py-2.5 text-right font-mono">{peso(n(p.basic_pay) + n(p.paid_leave_pay))}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-violet-700">{peso(n(p.holiday_pay) + n(p.holiday_ot_pay) + n(p.overtime_pay))}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-600">{peso(n(p.late_deduction) + n(p.absence_deduction) + n(p.leave_deduction))}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{peso(n(p.sss_deduction) + n(p.philhealth_deduction) + n(p.pagibig_deduction))}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{peso(p.tax_deduction)}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{peso(p.adjustments_total)}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-semibold">
                                {peso(p.net_pay)}
                                {(n(p.carry_over_out) > 0 || n(p.employer_shouldered) > 0) && (
                                  <span className="block text-[10px] font-sans font-semibold text-red-600" title="Deductions are more than the pay">
                                    {n(p.carry_over_out) > 0 ? `−${peso(p.carry_over_out)} to next cut-off` : `${peso(p.employer_shouldered)} by employer`}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{p.status === "paid" ? "Paid" : "Unpaid"}</span></td>
                              <td className="px-3 py-2.5">
                                <div className="flex justify-end gap-1.5">
                                  {p.status === "unpaid" && <button onClick={() => setAdjusting(p)} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 cursor-pointer">Earnings</button>}
                                  <button onClick={() => openPayslip(p)} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 cursor-pointer">Payslip</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <td colSpan={9} className="px-3 py-2.5 text-slate-400">Timesheet not approved by HR yet.</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {adjusting && <AdjustModal payroll={adjusting} onClose={() => setAdjusting(null)} onChanged={load} />}
    </AdminLayout>
  );
}
