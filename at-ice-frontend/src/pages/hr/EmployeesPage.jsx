import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import FaceCapture from "../../components/FaceCapture";
import PhoneInput from "../../components/PhoneInput";
import LoginEmailChip from "../../components/LoginEmailChip";
import { toast } from "../../lib/toast";
import { MOBILE_REGEX, MOBILE_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList, SkeletonTableRows } from "../../components/Skeleton";
import { NAME_SUFFIXES, cleanInitial, fullName } from "../../lib/names";
import { useLiveTick } from "../../lib/live";
import { PRINT_BASE_CSS, printDocument } from "../../lib/printDocument";
import EmptyState from "../../components/EmptyState";

const API_BASE = "/api";

const SearchIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const PlusIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const EditIcon    = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>;
const XIcon       = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const UserOffIcon = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></svg>;
const WalletIcon  = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>;
const CameraIcon  = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const EyeIcon     = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const FaceOkIcon  = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>;
const FaceNoIcon  = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const SortIcon    = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="4" y1="6" x2="14" y2="6"/><line x1="4" y1="12" x2="11" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/><polyline points="15 15 18 18 21 15"/><line x1="18" y1="6" x2="18" y2="18"/></svg>;

const SUB_ROLE_STYLE = {
  checker:     "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  salesman:    "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  maintenance: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  driver:      "bg-violet-500/10 text-violet-600 border-violet-500/20",
  guard:       "bg-blue-500/10 text-blue-600 border-blue-500/20",
  bagger:      "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

// Role badge of an employee. Driver's account uses role:"driver" with no
// sub_role (keeps the role:driver routes unchanged), and Guards and Baggers
// have no account at all, so their Position is the role.
function displayRole(emp) {
  if (!emp) return null;
  const user = emp.user;
  if (!user) return NO_ACCOUNT_POSITIONS.includes(emp.position) ? POSITION_ROLES[emp.position] : null;
  if (user.role === "driver") return "driver";
  return user.sub_role || null;
}
const roleLabel = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "—");

// Position sets the role, so Position and Role can never disagree.
// Guard and Bagger get no login account (attendance only).
const POSITION_ROLES = {
  Checker: "checker",
  Salesman: "salesman",
  Maintenance: "maintenance",
  Driver: "driver",
  Guard: "guard",
  Bagger: "bagger",
};
const NO_ACCOUNT_POSITIONS = ["Guard", "Bagger"];
const ROLE_FILTERS = ["all", ...Object.values(POSITION_ROLES)];

// Today as YYYY-MM-DD in the browser's local time (toISOString would be UTC).
const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Login email preview. The server makes the real one when the employee is
// saved: lastname.firstname.<employee number>@atice.cloud (EmployeeController).
const emailPart = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const emailPreview = (f) =>
  emailPart(f.last_name) && emailPart(f.first_name)
    ? `${emailPart(f.last_name)}.${emailPart(f.first_name)}.####@atice.cloud`
    : "";

// Departments HR picks from (same list as EmployeeController::DEPARTMENTS).
const DEPARTMENTS = ["Operations", "Sales", "Maintenance", "Logistics", "Security", "Production", "Administration", "Human Resources"];

const emptyForm = {
  first_name: "", middle_initial: "", last_name: "", suffix: "", email: "", daily_rate: "",
  phone: "", block_lot: "", street: "", subdivision: "", barangay: "",
  city: "", province: "", postal_code: "", position: "", department: "",
  _legacy: false, // display-only: true for an older employee with only the one-line address
  _legacyAddress: "", // display-only: old one-line address of an older employee
  date_hired: "", shift: "day",
  employment_type: "regular", sub_role: "",
  vehicle_plate: "", // Driver-only — ignored server-side for every other role
  _userRole: "", // display-only, set when editing — lets the Edit modal
                 // show "Driver" even though Driver has no sub_role
};

// ── Payroll computation (2026 PH rates, simplified/bracket-rounded) ──
function computeMSC(basicMonthly) {
  const msc = Math.round(basicMonthly / 500) * 500;
  return Math.min(Math.max(msc, 5000), 35000);
}
function computeSSS(basicMonthly) {
  const msc = computeMSC(basicMonthly);
  return +(msc * 0.05).toFixed(2); // employee share, 5%
}
function computePhilHealth(basicMonthly) {
  const base = Math.min(Math.max(basicMonthly, 10000), 100000);
  return +(base * 0.025).toFixed(2); // employee share, 2.5%
}
function computePagIbig(basicMonthly) {
  const base = Math.min(basicMonthly, 10000);
  return +Math.min(base * 0.02, 200).toFixed(2); // employee share, capped 200
}
// BIR TRAIN Law monthly withholding tax table, effective 2023 onward, still current for 2026
function computeWithholdingTax(taxableMonthly) {
  const t = taxableMonthly;
  if (t <= 20833) return 0;
  if (t <= 33333) return +((t - 20833) * 0.15).toFixed(2);
  if (t <= 66667) return +(1875 + (t - 33333) * 0.20).toFixed(2);
  if (t <= 166667) return +(8541.80 + (t - 66667) * 0.25).toFixed(2);
  if (t <= 666667) return +(33541.80 + (t - 166667) * 0.30).toFixed(2);
  return +(183541.80 + (t - 666667) * 0.35).toFixed(2);
}
// Contributions and tax are MONTHLY amounts, so they are computed on the
// employee's monthly basis (daily rate x 26 working days, 6-day work week),
// then split evenly across the two payroll cutoffs of the month.
const WORK_DAYS_PER_MONTH = 26;
const CUTOFFS_PER_MONTH = 2;
const half = (v) => +(v / CUTOFFS_PER_MONTH).toFixed(2);

function computePayroll(daysWorked, dailyRate) {
  const grossPay = +(daysWorked * dailyRate).toFixed(2);
  const monthlyBasis = +(dailyRate * WORK_DAYS_PER_MONTH).toFixed(2);

  if (grossPay <= 0 || monthlyBasis <= 0) {
    return { grossPay, monthlyBasis, sss: 0, philhealth: 0, pagibig: 0, tax: 0, netPay: grossPay };
  }

  const sssMonthly = computeSSS(monthlyBasis);
  const philhealthMonthly = computePhilHealth(monthlyBasis);
  const pagibigMonthly = computePagIbig(monthlyBasis);
  const taxableMonthly = Math.max(monthlyBasis - sssMonthly - philhealthMonthly - pagibigMonthly, 0);
  const taxMonthly = computeWithholdingTax(taxableMonthly);

  const sss = half(sssMonthly);
  const philhealth = half(philhealthMonthly);
  const pagibig = half(pagibigMonthly);
  const tax = half(taxMonthly);

  const totalDeductions = +(sss + philhealth + pagibig + tax).toFixed(2);
  const netPay = +(grossPay - totalDeductions).toFixed(2);
  return { grossPay, monthlyBasis, sss, philhealth, pagibig, tax, netPay };
}

// ── Payslip printing (computed payroll in the Payroll modal) ──
const PrintIcon = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesoTxt = (v) => `₱${(Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDay = (d) => {
  if (!d) return "—";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

function printPayslip({ employee, periodStart, periodEnd, days, rate, preview, notes }) {
  const name = fullName(employee);
  const total = preview.sss + preview.philhealth + preview.pagibig + preview.tax;
  const line = (label, value, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td class="amt">${esc(value)}</td></tr>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Payslip - ${esc(name)} - ${esc(fmtDay(periodStart))} to ${esc(fmtDay(periodEnd))}</title>
<style>
  ${PRINT_BASE_CSS}
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .co { font-size: 16px; font-weight: 700; color: #1E3A5F; }
  .addr { color: #475569; font-size: 10.5px; margin-top: 3px; max-width: 360px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 18px; letter-spacing: 2px; color: #1E3A5F; }
  .title div { color: #475569; font-size: 10.5px; margin-top: 3px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 14px 0; }
  .info div span { color: #64748b; display: inline-block; width: 105px; }
  h2 { font-size: 12px; margin: 14px 0 4px; color: #1E3A5F; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  td.amt { text-align: right; font-family: "Courier New", monospace; }
  tr.total td { font-weight: 700; border-top: 1px solid #94a3b8; }
  .net { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 14px; font-weight: 700; }
  .net .amt { font-family: "Courier New", monospace; font-size: 16px; }
  .note { color: #64748b; font-size: 10px; margin-top: 10px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .sign div { border-top: 1px solid #0f172a; padding-top: 4px; text-align: center; font-size: 10.5px; color: #334155; }
  .foot { margin-top: 24px; color: #94a3b8; font-size: 9.5px; text-align: center; }
</style></head>
<body><div class="sheet">
  <div class="head">
    <div>
      <div class="co">Bella Erin Tube Ice Inc.</div>
      <div class="addr">Block 63, Lot 4 Anubing St, Amparo Subdivision, Barangay 179 Zone 16, Caloocan City North, Metro Manila</div>
    </div>
    <div class="title">
      <h1>PAYSLIP</h1>
      <div>Payroll computation</div>
    </div>
  </div>

  <div class="info">
    <div><span>Employee</span><strong>${esc(name)}</strong></div>
    <div><span>Pay Period</span>${esc(fmtDay(periodStart))} – ${esc(fmtDay(periodEnd))}</div>
    <div><span>Employee ID</span>${esc(employee.employee_id || "—")}</div>
    <div><span>Days Worked</span>${esc(days)}</div>
    <div><span>Position</span>${esc(employee.position || "—")}</div>
    <div><span>Daily Rate</span>${esc(pesoTxt(rate))}</div>
  </div>

  <h2>Earnings</h2>
  <table>
    ${line(`Basic Pay (${days} days × ${pesoTxt(rate)})`, pesoTxt(preview.grossPay))}
    ${line("Gross Pay", pesoTxt(preview.grossPay), "total")}
  </table>

  <h2>Deductions</h2>
  <table>
    ${line("SSS", pesoTxt(preview.sss))}
    ${line("PhilHealth", pesoTxt(preview.philhealth))}
    ${line("Pag-IBIG", pesoTxt(preview.pagibig))}
    ${line("Withholding Tax", pesoTxt(preview.tax))}
    ${line("Total Deductions", pesoTxt(total), "total")}
  </table>

  <div class="net"><span>NET PAY</span><span class="amt">${esc(pesoTxt(preview.netPay))}</span></div>

  <div class="note">
    Monthly basis: ${esc(pesoTxt(rate))} × ${WORK_DAYS_PER_MONTH} days = ${esc(pesoTxt(preview.monthlyBasis))}.
    SSS, PhilHealth, Pag-IBIG and withholding tax are computed on the monthly basis and half is deducted per payroll cutoff.
    ${notes ? `<br>Notes: ${esc(notes)}` : ""}
  </div>

  <div class="sign">
    <div>Prepared by: HR Staff</div>
    <div>Received by: ${esc(name)}</div>
  </div>

  <div class="foot">Printed ${esc(new Date().toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))} · AT-ICE ERP</div>
</div></body></html>`;

  printDocument(html);
}

// Inclusive number of calendar days between two "YYYY-MM-DD" dates
function daysInPeriod(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000) + 1;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  // Login details of the employee just added, shown once (see handleSubmit).
  const [createdAccount, setCreatedAccount] = useState(null);
  const [search, setSearch]       = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]       = useState(false);

  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const [payrollFor, setPayrollFor]   = useState(null); // employee object or null
  const [faceFor, setFaceFor]         = useState(null); // employee whose face is being enrolled

  const [roleFilter, setRoleFilter]   = useState("all");
  const [unenrolledFirst, setUnenrolledFirst] = useState(false);

  const token = localStorage.getItem("token");
  const authHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/employees`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Couldn't load employees. Check that the backend is running.");
      console.error("fetchEmployees error:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["employees", "face"]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees, live]);

  const roleCounts = employees.reduce((acc, e) => {
    const r = displayRole(e);
    if (r) acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

  const filtered = employees
    .filter((e) => roleFilter === "all" || displayRole(e) === roleFilter)
    .filter((e) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${fullName(e)} ${e.employee_id} ${e.position} ${e.department ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  // Employees without an enrolled face go to the top (the order is otherwise kept)
  if (unenrolledFirst) filtered.sort((a, b) => Number(!!a.face_data) - Number(!!b.face_data));
  const unenrolledCount = employees.filter((e) => !e.face_data).length;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  };

  // Opened from Interviews after hiring: Add Employee, filled in from the
  // applicant (name, mobile, position), then the state is cleared so a
  // reload does not open it again.
  const location = useLocation();
  const navigate = useNavigate();
  const [fromApplicant, setFromApplicant] = useState(null);
  useEffect(() => {
    const a = location.state?.fromApplicant;
    if (!a) return;
    const parts = String(a.name || "").trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : "";
    const position = POSITION_ROLES[a.position_applied] ? a.position_applied : "";
    setEditingId(null);
    setForm({
      ...emptyForm,
      first_name: parts.join(" "),
      last_name: last,
      phone: localDigits(a.phone),
      position,
      sub_role: POSITION_ROLES[position] || "",
      date_hired: todayStr(),
    });
    setFormErrors({});
    setFromApplicant(a);
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const openEdit = (emp) => {
    setEditingId(emp.id);
    setForm({
      first_name: emp.first_name || "",
      middle_initial: emp.middle_initial || "",
      last_name: emp.last_name || "",
      suffix: emp.suffix || "",
      email: emp.user?.email || "",
      phone: localDigits(emp.phone),
      block_lot: emp.block_lot || "",
      street: emp.street || "",
      subdivision: emp.subdivision || "",
      barangay: emp.barangay || "",
      city: emp.city || "",
      province: emp.province || "",
      postal_code: emp.postal_code || "",
      // Older employees have only the one-line address. Show it as a reference.
      _legacy: !(emp.street || emp.barangay),
      _legacyAddress: emp.street || emp.barangay ? "" : (emp.address || ""),
      position: emp.position || "",
      department: emp.department || "",
      daily_rate: emp.daily_rate != null ? String(Number(emp.daily_rate)) : "",
      date_hired: emp.date_hired ? emp.date_hired.slice(0, 10) : "",
      shift: emp.shift || "day",
      employment_type: emp.employment_type || "regular",
      sub_role: emp.user?.sub_role || "",  // display-only in edit mode
      vehicle_plate: emp.vehicle_plate || "",
      _userRole: emp.user?.role || "",     // needed to detect Driver, who has no sub_role
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setFormErrors({}); setFromApplicant(null); };

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // Choosing a Position also sets the login role.
  const handlePositionChange = (e) => {
    const position = e.target.value;
    setForm((f) => ({ ...f, position, sub_role: POSITION_ROLES[position] || "" }));
  };

  const isDriverForm = editingId
    ? form._userRole === "driver"
    : form.sub_role === "driver";
  // Guard or Bagger: no login account, so no email, password or login role
  const noAccountForm = NO_ACCOUNT_POSITIONS.includes(form.position);

  // Older employees have only the one-line address and can be edited without the
  // new fields. Once any new address field is filled, all four main fields are required.
  const addressInUse = ["block_lot", "street", "subdivision", "barangay", "city", "province", "postal_code"]
    .some((f) => String(form[f] || "").trim() !== "");
  const addressRequired = !form._legacy || addressInUse;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});

    if (form.phone && !MOBILE_REGEX.test(form.phone)) {
      setFormErrors({ phone: [MOBILE_MESSAGE] });
      return;
    }
    // A new employee with a login account needs a mobile number, so HR can reach them.
    if (editingId === null && !noAccountForm && !form.phone) {
      setFormErrors({ phone: ["Enter the mobile number of the employee."] });
      return;
    }
    if (addressRequired) {
      const missing = {};
      for (const f of ["street", "barangay", "city", "province"]) {
        if (!String(form[f] || "").trim()) missing[f] = ["Required when an address is filled in."];
      }
      if (Object.keys(missing).length) {
        setFormErrors(missing);
        return;
      }
    }
    if (form.postal_code && !/^\d{4}$/.test(form.postal_code)) {
      setFormErrors({ postal_code: ["Postal code must be 4 digits."] });
      return;
    }
    if (form.date_hired > todayStr()) {
      setFormErrors({ date_hired: ["Date hired cannot be in the future."] });
      return;
    }

    setSaving(true);

    const isCreate = editingId === null;
    const url = isCreate ? `${API_BASE}/employees` : `${API_BASE}/employees/${editingId}`;
    const method = isCreate ? "POST" : "PUT";

    const payload = isCreate
      ? {
          first_name: form.first_name, middle_initial: form.middle_initial || null,
          last_name: form.last_name, suffix: form.suffix || null,
          phone: form.phone ? toStoredPhone(form.phone) : null, block_lot: form.block_lot, street: form.street,
          subdivision: form.subdivision, barangay: form.barangay, city: form.city,
          province: form.province, postal_code: form.postal_code,
          position: form.position, department: form.department,
          daily_rate: Number(form.daily_rate) || 0, date_hired: form.date_hired,
          shift: form.shift, employment_type: form.employment_type,
          sub_role: form.sub_role || null,
          vehicle_plate: form.sub_role === "driver" ? (form.vehicle_plate || null) : null,
        }
      : {
          first_name: form.first_name, middle_initial: form.middle_initial || null,
          last_name: form.last_name, suffix: form.suffix || null,
          phone: toStoredPhone(form.phone), block_lot: form.block_lot, street: form.street,
          subdivision: form.subdivision, barangay: form.barangay, city: form.city,
          province: form.province, postal_code: form.postal_code,
          position: form.position, department: form.department,
          daily_rate: Number(form.daily_rate) || 0,
          shift: form.shift, employment_type: form.employment_type,
          vehicle_plate: form._userRole === "driver" ? (form.vehicle_plate || null) : null,
        };

    try {
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);

      if (res.status === 422 && data?.errors) {
        // Fields that show their own error under the input. Any other
        // field error is shown at the top so it is never silently hidden.
        const SHOWN = ["first_name", "middle_initial", "last_name", "suffix", "email", "phone", "department", "daily_rate", "street", "barangay", "city", "province", "block_lot", "subdivision", "postal_code", "position", "sub_role", "vehicle_plate", "shift", "employment_type", "date_hired"];
        const hidden = Object.keys(data.errors).filter((k) => !SHOWN.includes(k));
        setFormErrors(hidden.length ? { ...data.errors, _general: data.errors[hidden[0]] } : data.errors);
        return;
      }
      if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);

      await fetchEmployees();
      closeModal();
      const name = fullName(data?.employee) || "The employee";
      if (isCreate) {
        toast.success(`${name} was added as ${form.position}.`);
        if (data?.password) {
          // Shown once so HR can give the login details to the employee.
          setCreatedAccount({ name, email: data.email, password: data.password });
        }
      } else {
        toast.success(`${name}'s details were saved.`);
      }
    } catch (err) {
      setFormErrors({ _general: [err.message || "Request failed. Try again."] });
      console.error("save employee error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (emp) => {
    try {
      const res = await fetch(`${API_BASE}/employees/${emp.id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setConfirmDeactivate(null);
      toast.success(`${fullName(emp)} was removed from the employee list.`);
      await fetchEmployees();
    } catch (err) {
      console.error("deactivate employee error:", err);
      toast.error("Couldn't deactivate that employee. Please try again.");
      setConfirmDeactivate(null);
    }
  };


  // Mobile number field: beside Email when adding (it is required then), in the
  // address section when editing.
  const phoneField = (
    <Field label={editingId ? "Phone" : "Mobile Number"} required={!editingId && !noAccountForm} error={formErrors.phone}>
      <PhoneInput
        value={form.phone}
        onChange={(phone) => {
          setForm((f) => ({ ...f, phone }));
          if (formErrors.phone) setFormErrors((fe) => ({ ...fe, phone: undefined }));
        }}
        className={inputCls}
        invalid={!!form.phone && !MOBILE_REGEX.test(form.phone)}
      />
      {!formErrors.phone && form.phone && !MOBILE_REGEX.test(form.phone) && (
        <span className="text-[10px] text-red-500">{MOBILE_MESSAGE}</span>
      )}
    </Field>
  );
  return (
    <HrLayout pageTitle="Employees" breadcrumb="HRIS / Employees">
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">Employees</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Checker, Salesman, Maintenance and Driver accounts, plus Guards and Baggers (attendance only).
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-black/[0.09] rounded-md text-xs text-slate-500 w-[220px]">
              <SearchIcon />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee..."
                className="bg-transparent outline-none w-full placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-medium rounded-md transition-colors"
            >
              <PlusIcon /> Add Employee
            </button>
          </div>
        </div>

        {/* Filters: role chips, and a button that puts employees with no enrolled face on top */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by role">
            {ROLE_FILTERS.map((r) => {
              const active = roleFilter === r;
              const count = r === "all" ? employees.length : roleCounts[r] || 0;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    active ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r === "all" ? "All" : roleLabel(r)} <span className={active ? "opacity-80" : "text-slate-400"}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            aria-pressed={unenrolledFirst}
            onClick={() => setUnenrolledFirst((v) => !v)}
            title="Put employees with no enrolled face at the top of the list"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
              unenrolledFirst ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-600 hover:bg-slate-50"
            }`}
          >
            <SortIcon /> Unenrolled first
            <span className={`px-1.5 rounded-full text-[10px] ${unenrolledCount ? "bg-red-500/10 text-red-600" : "text-slate-400"}`}>{unenrolledCount}</span>
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 px-3.5 py-2.5 bg-red-500/[0.06] border border-red-500/20 rounded-md text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.06em] uppercase text-slate-400 border-b border-black/[0.09]">
                <th className="px-5 py-2.5 font-medium">Employee</th>
                <th className="px-5 py-2.5 font-medium">Employee ID</th>
                <th className="px-5 py-2.5 font-medium">Email</th>
                <th className="px-5 py-2.5 font-medium">Position</th>
                <th className="px-5 py-2.5 font-medium">Role</th>
                <th className="px-5 py-2.5 font-medium">Shift</th>
                <th className="px-5 py-2.5 font-medium">Face ID</th>
                <th className="px-5 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={8} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400 text-xs">
                  {search || roleFilter !== "all" ? "No employees match your search or filter." : "No employees yet. Use Add Employee to create one."}
                </td></tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="border-b border-black/[0.06] last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{fullName(emp)}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-[12px] whitespace-nowrap">{emp.employee_id}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {emp.user?.email
                        ? <LoginEmailChip userId={emp.user.id} email={emp.user.email} onSaved={fetchEmployees} />
                        : <span className="text-slate-400">No system account</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {emp.position}
                      {emp.department && <div className="text-[11px] text-slate-400">{emp.department}</div>}
                    </td>
                    <td className="px-5 py-3">
                      {displayRole(emp) ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${SUB_ROLE_STYLE[displayRole(emp)] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          {roleLabel(displayRole(emp))}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                      {emp.user?.role === "driver" && emp.vehicle_plate && (
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">PN: {emp.vehicle_plate}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 capitalize">{emp.shift}</td>
                    <td className="px-5 py-3">
                      {emp.face_data ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <FaceOkIcon /> Registered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-red-500/10 text-red-600 border-red-500/20">
                          <FaceNoIcon /> None
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setFaceFor(emp)}
                          title={emp.face_data ? "View, re-enroll or remove this employee's face" : "Register this employee's face"}
                          className={emp.face_data
                            ? "flex items-center gap-1 px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                            : "flex items-center gap-1 px-2.5 py-1 bg-cyan-500 hover:bg-cyan-600 rounded-md text-[11px] font-semibold text-white cursor-pointer"}
                        >
                          {emp.face_data ? <><EyeIcon /> View</> : <><CameraIcon /> Face</>}
                        </button>
                        <button
                          onClick={() => setPayrollFor(emp)}
                          title="Payroll"
                          className="flex items-center gap-1 px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <WalletIcon /> Payroll
                        </button>
                        <button
                          onClick={() => openEdit(emp)}
                          className="flex items-center gap-1 px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <EditIcon /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeactivate(emp)}
                          title="Deactivate"
                          aria-label={`Deactivate ${fullName(emp)}`}
                          className="flex items-center justify-center w-7 h-[26px] bg-red-500 hover:bg-red-600 rounded-md text-white cursor-pointer"
                        >
                          <UserOffIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
              <div className="text-[15px] font-semibold text-slate-800">
                {editingId ? "Edit Employee" : "Add Employee"}
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700">
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3.5">
              {fromApplicant && !editingId && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg px-3 py-2">
                  Hired applicant <span className="font-semibold">{fromApplicant.name}</span> ({fromApplicant.position_applied}). Check the details and fill in the rest to make them an employee.
                </div>
              )}
              {formErrors._general && (
                <div className="px-3 py-2 bg-red-500/[0.06] border border-red-500/20 rounded-md text-xs text-red-600">
                  {formErrors._general[0]}
                </div>
              )}

              {/* Position first: it decides whether the employee gets a login account */}
              <div className="flex flex-col gap-3">
                <Field label="Position" required error={formErrors.position}>
                  {editingId ? (
                    <input readOnly value={form.position || "—"} className={`${inputCls} bg-slate-100 text-slate-500`} />
                  ) : (
                    <select required value={form.position} onChange={handlePositionChange} className={inputCls}>
                      <option value="">Select position</option>
                      {Object.keys(POSITION_ROLES).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  )}
                </Field>
                {noAccountForm && (
                  <p className="-mt-1 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-[11px] text-blue-700">
                    {form.position}s have no system account. They are recorded for attendance (face enrollment) and payroll only.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                <Field label="First Name" required error={formErrors.first_name}>
                  <input required value={form.first_name} onChange={handleChange("first_name")} className={inputCls} />
                </Field>
                <Field label="M.I." error={formErrors.middle_initial}>
                  <input
                    value={form.middle_initial}
                    onChange={(e) => setForm((f) => ({ ...f, middle_initial: cleanInitial(e.target.value) }))}
                    maxLength={2}
                    placeholder="e.g. D"
                    aria-label="Middle initial"
                    autoCapitalize="characters"
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                <Field label="Last Name" required error={formErrors.last_name}>
                  <input required value={form.last_name} onChange={handleChange("last_name")} className={inputCls} />
                </Field>
                <Field label="Suffix" error={formErrors.suffix}>
                  <select value={form.suffix} onChange={handleChange("suffix")} aria-label="Name suffix" className={inputCls}>
                    <option value="">None</option>
                    {NAME_SUFFIXES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
              </div>

              {!editingId && !noAccountForm && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[11px] text-slate-500">Email (made automatically)</span>
                    <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px] min-w-0">
                      {emailPreview(form)
                        ? <span className="font-mono text-slate-800 truncate" title={emailPreview(form)}>{emailPreview(form)}</span>
                        : <span className="text-slate-400">Fill in the First and Last Name</span>}
                    </div>
                    <span className="text-[10px] text-slate-400 leading-snug">#### is the employee number, given when saved.</span>
                  </div>
                  {phoneField}
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Password (made automatically)</span>
                    <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px]">
                      <span className="text-slate-400">A random one-time password is made when you save</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-snug">
                      It is shown once, right after saving. Give it to the employee with their email. They must change it on first sign-in.
                    </span>
                  </div>
                </div>
              )}
              {editingId && (
                <div className="text-[11px] text-slate-400 -mt-1.5">
                  {form.email
                    ? <>Email: {form.email} · To fix it, click the pencil beside the email in the list.</>
                    : "No system account (attendance only)."}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {(editingId || noAccountForm) && phoneField}
                <div className="col-span-2 text-[12px] font-semibold text-slate-700 mt-1">Address</div>
                {form._legacyAddress && !addressInUse && (
                  <p className="col-span-2 -mt-1 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                    Saved address (old format): {form._legacyAddress}. Fill in the fields below to replace it.
                  </p>
                )}
                <Field label="Block and Lot" error={formErrors.block_lot}>
                  <input value={form.block_lot} onChange={handleChange("block_lot")} placeholder="e.g. Blk 5 Lot 12" className={inputCls} />
                </Field>
                <Field label="Street" required={addressRequired} error={formErrors.street}>
                  <input required={addressRequired} value={form.street} onChange={handleChange("street")} placeholder="e.g. Quirino Highway" className={inputCls} />
                </Field>
                <Field label="Subdivision" error={formErrors.subdivision}>
                  <input value={form.subdivision} onChange={handleChange("subdivision")} placeholder="e.g. Citrus Subdivision" className={inputCls} />
                </Field>
                <Field label="Barangay" required={addressRequired} error={formErrors.barangay}>
                  <input required={addressRequired} value={form.barangay} onChange={handleChange("barangay")} placeholder="e.g. Muzon" className={inputCls} />
                </Field>
                <Field label="City" required={addressRequired} error={formErrors.city}>
                  <input required={addressRequired} value={form.city} onChange={handleChange("city")} placeholder="e.g. San Jose del Monte" className={inputCls} />
                </Field>
                <Field label="Province" required={addressRequired} error={formErrors.province}>
                  <input required={addressRequired} value={form.province} onChange={handleChange("province")} placeholder="e.g. Bulacan" className={inputCls} />
                </Field>
                <Field label="Postal Code" error={formErrors.postal_code}>
                  <input
                    inputMode="numeric"
                    placeholder="e.g. 3023"
                    value={form.postal_code}
                    onChange={(e) => { const postal_code = e.target.value.replace(/\D/g, "").slice(0, 4); setForm((f) => ({ ...f, postal_code })); }}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Department" error={formErrors.department}>
                  <select value={form.department} onChange={handleChange("department")} aria-label="Department" className={inputCls}>
                    <option value="">Choose a department</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    {form.department && !DEPARTMENTS.includes(form.department) && (
                      <option value={form.department}>{form.department} (old)</option>
                    )}
                  </select>
                </Field>
                <Field label="Daily Rate (₱)" required error={formErrors.daily_rate}>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.daily_rate}
                    onChange={handleChange("daily_rate")}
                    placeholder="e.g. 610"
                    className={inputCls}
                  />
                </Field>
              </div>

              {!editingId && !noAccountForm && (
                <Field label="Employee Role (set from Position)" error={formErrors.sub_role}>
                  <input
                    readOnly
                    value={form.sub_role ? form.sub_role.charAt(0).toUpperCase() + form.sub_role.slice(1) : "—"}
                    className={`${inputCls} bg-slate-100 text-slate-500`}
                  />
                </Field>
              )}
              {editingId && (
                <div className="text-[11px] text-slate-400 -mt-1.5">
                  Role: {roleLabel(form.sub_role || (form._userRole === "driver" ? "driver" : POSITION_ROLES[form.position] || ""))} · Not editable here.
                </div>
              )}

              {isDriverForm && (
                <Field label="Vehicle Plate Number" error={formErrors.vehicle_plate}>
                  <input
                    value={form.vehicle_plate}
                    onChange={handleChange("vehicle_plate")}
                    placeholder="e.g. V7824"
                    className={inputCls}
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Optional. Shown to customers alongside the driver's name (e.g. "Rhalf Valencia (PN: V7824)").
                  </span>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Shift" required error={formErrors.shift}>
                  <select required value={form.shift} onChange={handleChange("shift")} className={inputCls}>
                    <option value="day">Day</option>
                    <option value="night">Night</option>
                  </select>
                </Field>
                <Field label="Employment Type" required error={formErrors.employment_type}>
                  <select required value={form.employment_type} onChange={handleChange("employment_type")} className={inputCls}>
                    <option value="regular">Regular</option>
                    <option value="contractual">Contractual</option>
                    <option value="part_time">Part-Time</option>
                  </select>
                </Field>
              </div>

              {!editingId && (
                <Field label="Date Hired" required error={formErrors.date_hired}>
                  <input required type="date" max={todayStr()} value={form.date_hired} onChange={handleChange("date_hired")} className={inputCls} />
                </Field>
              )}

              {!editingId && (
                <div className="text-[11px] text-slate-400 -mt-1">
                  Daily rate isn't set here — use the Payroll action on this employee's row once the account exists.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.09] mt-1">
                <button type="button" onClick={closeModal} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
                >
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DEACTIVATE CONFIRM ── */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm px-5 py-5">
            <div className="text-[15px] font-semibold text-slate-800 mb-1.5">Deactivate employee?</div>
            <div className="text-xs text-slate-500 mb-4">
              {fullName(confirmDeactivate)} will no longer appear in the active employee list. This doesn't delete their attendance or payroll history.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeactivate(null)} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmDeactivate)}
                className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition-colors"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {payrollFor && (
        <PayrollModal employee={payrollFor} authHeaders={authHeaders} onClose={() => setPayrollFor(null)} />
      )}

      {faceFor && (
        <FaceModal
          employee={faceFor}
          authHeaders={authHeaders}
          onClose={() => setFaceFor(null)}
          onSaved={() => { setFaceFor(null); fetchEmployees(); }}
        />
      )}
      {/* Account created: login details shown once in a pop-up */}
      {createdAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="acct-created-title">
          <div className="bg-white rounded-xl border border-black/[0.09] shadow-2xl w-full max-w-sm p-5">
            <div className="text-[15px] font-semibold text-slate-800" id="acct-created-title">Account created</div>
            <p className="text-xs text-slate-500 mt-1">
              Give these login details to <b className="text-slate-700">{createdAccount.name}</b>. They are shown only now
              and cannot be looked up again. The employee must set a new password on first sign-in.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {[["Email", createdAccount.email], ["Password", createdAccount.password]].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-black/[0.09]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="font-mono text-[13px] text-slate-800 break-all select-all">{value}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copied.`), () => {})}
                    className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setCreatedAccount(null)}
              className="mt-4 w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-[13px] font-semibold rounded-lg cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </HrLayout>
  );
}

const inputCls = "w-full px-3 py-1.5 border border-black/[0.09] rounded-md text-[13px] text-slate-800 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20";

function Field({ label, error, required, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-500">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && <span className="text-[10px] text-red-500">{error[0]}</span>}
    </label>
  );
}

// ── FACE MODAL ──
// Not enrolled yet: webcam capture, then Save Face (the picture is saved too).
// Enrolled: shows the saved picture, with Re-enroll (opens the camera to
// replace it) and Remove Face.
// Saved pictures are on the backend's public disk, served at /storage/...
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function FaceModal({ employee, authHeaders, onClose, onSaved }) {
  const [descriptor, setDescriptor] = useState(null);
  const [photo, setPhoto] = useState(null); // JPEG data URL of the captured face
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const enrolled = employee.face_data; // { id, employee_id, photo_path, created_at, updated_at } or null
  const [capturing, setCapturing] = useState(!enrolled);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const name = fullName(employee);

  // The enrolled picture is private: it is fetched with the login token and shown
  // from an in-memory URL (an <img src> cannot send the token).
  const photoId = enrolled?.photo_path ? enrolled.id : null;
  useEffect(() => {
    if (!photoId) return undefined;
    let cancelled = false;
    let url = null;
    fetch(`${API_BASE}/face-data/${photoId}/photo`, {
      headers: { Accept: "image/jpeg", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("no picture"))))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(url);
        else setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoBroken(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);
  const savedPhoto = photoId && !photoBroken ? photoUrl : null;
  const onCapture = (d, p) => { setDescriptor(d); setPhoto(p); };

  const send = async (url, method, body) => {
    const res = await fetch(url, { method, headers: authHeaders, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const first = data.errors ? Object.values(data.errors).flat()[0] : null;
      throw new Error(data.message || first || `Request failed (${res.status})`);
    }
    return data;
  };

  const save = async () => {
    if (!descriptor) return;
    setBusy(true);
    try {
      if (enrolled) {
        await send(`${API_BASE}/face-data/${enrolled.id}`, "PUT", { descriptor: Array.from(descriptor), photo });
        toast.success(`${name}'s face was updated.`);
      } else {
        await send(`${API_BASE}/face-enroll`, "POST", {
          worker_name: name,
          role: displayRole(employee),
          employee_id: employee.id,
          descriptor: Array.from(descriptor),
          photo,
        });
        toast.success(`${name}'s face was enrolled.`);
      }
      onSaved();
    } catch (err) {
      toast.error(err.message || "Couldn't save the face. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await send(`${API_BASE}/face-data/${enrolled.id}`, "DELETE");
      toast.success(`${name}'s face enrollment was removed.`);
      onSaved();
    } catch (err) {
      toast.error(err.message || "Couldn't remove the face enrollment.");
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">
              {!enrolled ? "Enroll Face" : capturing ? "Re-enroll Face" : "Registered Face"}
            </div>
            <div className="text-xs text-slate-400">{name} · {employee.employee_id} · {roleLabel(displayRole(employee))}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer"><XIcon /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {enrolled && !capturing && (
            /* The picture saved when the face was enrolled */
            <div className="bg-white border border-black/[0.09] rounded-xl p-4 flex flex-col items-center gap-3">
              {savedPhoto ? (
                <img
                  src={savedPhoto}
                  alt={`${name}'s enrolled face`}
                  onError={() => setPhotoBroken(true)}
                  className="w-56 h-56 max-w-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-56 h-56 max-w-full rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2 text-center px-4 text-[12px] text-slate-500">
                  <CameraIcon />
                  No picture was saved with this enrollment. Re-enroll to save one.
                </div>
              )}
              <div className="flex flex-col items-center gap-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <FaceOkIcon /> Registered
                </span>
                <span className="text-[11px] text-slate-400">Enrolled {fmtDateTime(enrolled.updated_at || enrolled.created_at)}</span>
              </div>
            </div>
          )}

          {enrolled && capturing && (
            <p className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700">
              Capturing a new face replaces the registered one and its picture. The attendance history is kept.
            </p>
          )}

          {capturing && <FaceCapture descriptor={descriptor} onChange={onCapture} onError={toast.error} />}

          {confirmRemove ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-red-50 border border-red-200">
              <span className="flex-1 text-[12px] text-red-700">
                Remove {name}'s face? They will not be recognized at the Attendance Station until enrolled again.
              </span>
              <button onClick={() => setConfirmRemove(false)} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
              <button
                onClick={remove}
                disabled={busy}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded-md cursor-pointer"
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              {enrolled && !capturing && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="px-3.5 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-medium rounded-md cursor-pointer"
                >
                  Remove Face
                </button>
              )}
              <div className="flex-1" />
              {enrolled && capturing ? (
                <button type="button" onClick={() => { setCapturing(false); onCapture(null, null); }} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer">Back</button>
              ) : (
                <button type="button" onClick={onClose} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer">{capturing ? "Cancel" : "Close"}</button>
              )}
              {capturing ? (
                <button
                  type="button"
                  onClick={save}
                  disabled={!descriptor || busy}
                  className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                >
                  {busy ? "Saving…" : enrolled ? "Replace Face" : "Save Face"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCapturing(true)}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                >
                  <CameraIcon /> Re-enroll
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PAYROLL MODAL ──
function PayrollModal({ employee, authHeaders, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [daysWorked, setDaysWorked] = useState("");
  // The saved daily rate of the employee (HRIS > Employees > Edit).
  const [dailyRate] = useState(employee.daily_rate != null ? String(Number(employee.daily_rate)) : "");
  const [notes, setNotes] = useState("");
  // Days worked come from attendance for the chosen period.
  const [attendance, setAttendance] = useState(null); // { days_worked, days_present, missing_time_out } or null
  const [attLoading, setAttLoading] = useState(false);

  useEffect(() => {
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      setAttendance(null);
      setDaysWorked("");
      return;
    }
    let cancelled = false;
    setAttLoading(true);
    const q = new URLSearchParams({ employee_id: employee.id, from: periodStart, to: periodEnd });
    fetch(`${API_BASE}/attendances/summary?${q}`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setAttendance(data);
        setDaysWorked(String(data.days_worked ?? 0));
      })
      .catch(() => { if (!cancelled) { setAttendance(null); setDaysWorked(""); } })
      .finally(() => { if (!cancelled) setAttLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart, periodEnd, employee.id]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payrolls?employee_id=${employee.id}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Couldn't load payroll records.");
      console.error("fetchRecords error:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["payroll"]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, live]);

  const days = parseFloat(daysWorked) || 0;
  const rate = parseFloat(dailyRate) || 0;
  const preview = computePayroll(days, rate);
  const periodDays = daysInPeriod(periodStart, periodEnd);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (periodStart > todayStr()) {
      setError("Period Start cannot be a future date.");
      return;
    }
    if (periodDays !== null && periodDays < 1) {
      setError("Period End must be on or after Period Start.");
      return;
    }
    if (periodDays !== null && days > periodDays) {
      setError(`Days Worked (${days}) cannot be more than the ${periodDays} calendar days in this period.`);
      return;
    }
    if (preview.netPay < 0) {
      setError("Deductions are higher than the gross pay for this period. Check the days worked and daily rate.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/payrolls`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          employee_id: employee.id,
          period_start: periodStart,
          period_end: periodEnd,
          days_worked: days,
          daily_rate: rate,
          gross_pay: preview.grossPay,
          sss_deduction: preview.sss,
          philhealth_deduction: preview.philhealth,
          pagibig_deduction: preview.pagibig,
          tax_deduction: preview.tax,
          other_deductions: 0,
          net_pay: preview.netPay,
          status: "pending",
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
        throw new Error(firstError || data?.message || `Request failed (${res.status})`);
      }

      setPeriodStart(""); setPeriodEnd(""); setDaysWorked(""); setNotes("");
      toast.success(`Payroll entry added for ${fullName(employee)}.`);
      await fetchRecords();
    } catch (err) {
      setError(err.message || "Couldn't save payroll record.");
      console.error("save payroll error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">Payroll</div>
            <div className="text-xs text-slate-400">{fullName(employee)} · {employee.employee_id}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><XIcon /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/[0.06] border border-red-500/20 rounded-md text-xs text-red-600">{error}</div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">History</div>
            {loading ? (
              <SkeletonList />
            ) : records.length === 0 ? (
              <EmptyState icon="wallet" compact>No payroll records yet.</EmptyState>
            ) : (
              <div className="border border-black/[0.09] rounded-md overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-slate-400 bg-slate-50 border-b border-black/[0.09]">
                      <th className="px-3 py-2 font-medium">Period</th>
                      <th className="px-3 py-2 font-medium text-right">Gross</th>
                      <th className="px-3 py-2 font-medium text-right">Deductions</th>
                      <th className="px-3 py-2 font-medium text-right">Net Pay</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const totalDed = +(r.sss_deduction) + +(r.philhealth_deduction) + +(r.pagibig_deduction) + +(r.tax_deduction) + +(r.other_deductions);
                      return (
                        <tr key={r.id} className="border-b border-black/[0.06] last:border-0">
                          <td className="px-3 py-2 text-slate-600">{r.period_start} to {r.period_end}</td>
                          <td className="px-3 py-2 text-right text-slate-700">₱{Number(r.gross_pay).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                          <td className="px-3 py-2 text-right text-red-500">₱{totalDed.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">₱{Number(r.net_pay).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                          <td className="px-3 py-2 capitalize text-slate-600">{r.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-black/[0.09] pt-4 flex flex-col gap-3">
            <div className="text-xs font-medium text-slate-700">New Payroll Entry</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Period Start">
                <input required type="date" max={todayStr()} value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); if (periodEnd && e.target.value > periodEnd) setPeriodEnd(""); }} className={inputCls} />
              </Field>
              <Field label="Period End">
                <input required type="date" min={periodStart || undefined} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">Days Worked (from attendance)</span>
                <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px]">
                  {!periodStart || !periodEnd
                    ? <span className="text-slate-400">Choose the period first</span>
                    : attLoading
                      ? <span className="text-slate-400">Counting…</span>
                      : attendance
                        ? <span className="font-semibold text-slate-800">{attendance.days_worked} day{attendance.days_worked === 1 ? "" : "s"}</span>
                        : <span className="text-red-500">Could not read attendance</span>}
                </div>
                {attendance && (
                  <span className="text-[10px] text-slate-400 leading-snug">
                    {attendance.days_present} day{attendance.days_present === 1 ? "" : "s"} with Time In; under 4 hours counts as half a day.
                    {attendance.missing_time_out > 0 && ` ${attendance.missing_time_out} without Time Out (counted as a full day).`}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">Daily Rate (₱)</span>
                <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px]">
                  {rate > 0
                    ? <span className="font-semibold text-slate-800">₱{rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    : <span className="text-red-500">No daily rate yet</span>}
                </div>
                <span className="text-[10px] text-slate-400 leading-snug">From the employee's profile. Change it with Edit.</span>
              </div>
            </div>
            <Field label="Notes (optional)">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </Field>

            {days > 0 && rate > 0 && (
              <div className="bg-slate-50 border border-black/[0.09] rounded-md px-3.5 py-3 text-[12px] flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Monthly basis (₱{rate.toLocaleString(undefined, {minimumFractionDigits:2})} × {WORK_DAYS_PER_MONTH} days)</span>
                  <span>₱{preview.monthlyBasis.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                </div>
                <Row label={`Gross Pay (${days} day${days === 1 ? "" : "s"} × ₱${rate.toLocaleString(undefined, {minimumFractionDigits:2})})`} value={preview.grossPay} bold />
                <Row label="SSS" value={-preview.sss} />
                <Row label="PhilHealth" value={-preview.philhealth} />
                <Row label="Pag-IBIG" value={-preview.pagibig} />
                <Row label="Withholding Tax" value={-preview.tax} />
                <div className="border-t border-black/[0.09] mt-1 pt-1">
                  <Row label="Net Pay" value={preview.netPay} bold highlight />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  SSS, PhilHealth, Pag-IBIG and withholding tax are computed on the monthly basis, then half is deducted per payroll cutoff (two cutoffs per month).
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {days > 0 && rate > 0 && periodStart && periodEnd && (
                <button
                  type="button"
                  onClick={() => printPayslip({ employee, periodStart, periodEnd, days, rate, preview, notes })}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 border border-cyan-500/40 text-cyan-600 hover:bg-cyan-50 text-xs font-medium rounded-md transition-colors"
                >
                  <PrintIcon /> Print
                </button>
              )}
              <div className="flex-1" />
              <button type="button" onClick={onClose} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700">Close</button>
              <button
                type="submit"
                disabled={saving || attLoading || !attendance || rate <= 0}
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
              >
                {saving ? "Saving…" : "Add Payroll Entry"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, highlight }) {
  const isNeg = value < 0;
  return (
    <div className={`flex justify-between ${bold ? "font-medium" : ""} ${highlight ? "text-cyan-600" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{isNeg ? "-" : ""}₱{Math.abs(value).toLocaleString(undefined, {minimumFractionDigits:2})}</span>
    </div>
  );
}

