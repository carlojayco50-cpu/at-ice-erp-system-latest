import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import FaceCapture from "../../components/FaceCapture";
import PhoneInput from "../../components/PhoneInput";
import LoginEmailChip from "../../components/LoginEmailChip";
import { toast } from "../../lib/toast";
import { defaultEmployeePassword } from "../../lib/password";
import { MOBILE_REGEX, MOBILE_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList, SkeletonTableRows } from "../../components/Skeleton";
import { NAME_SUFFIXES, cleanInitial, fullName, shiftLabel } from "../../lib/names";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import AddressFields from "../../components/AddressFields";
import ScanDropZone from "../../components/ScanDropZone";
import { filledFrom } from "../../lib/scanDocument";
import { formatLicense, licenseError, expiryError, tomorrowStr } from "../../lib/license";

const API_BASE = "/api";

const SearchIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const PlusIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const EditIcon    = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>;
const XIcon       = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const UserOffIcon = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></svg>;
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

// YYYY-MM-DD n days from today (local time)
const addDaysStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Login email preview. The server makes the real one when the employee is
// saved: lastname.<employee number>@atice.cloud (EmployeeController).
const emailPart = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const emailPreview = (f) =>
  emailPart(f.last_name) ? `${emailPart(f.last_name)}.####@atice.cloud` : "";

// Departments HR picks from (same list as EmployeeController::DEPARTMENTS).
const DEPARTMENTS = ["Operations", "Sales", "Maintenance", "Logistics", "Security", "Production", "Administration", "Human Resources"];

const emptyForm = {
  first_name: "", middle_initial: "", last_name: "", suffix: "", email: "", daily_rate: "",
  phone: "", block_lot: "", street: "", subdivision: "", barangay: "",
  city: "", province: "", region: "", barangay_code: "", postal_code: "", position: "", department: "",
  _legacy: false, // display-only: true for an older employee with only the one-line address
  _legacyAddress: "", // display-only: old one-line address of an older employee
  date_hired: "", shift: "day",
  employment_type: "regular", sub_role: "",
  // New hires start probationary (no leave filing until regular)
  employment_status: "probationary", pay_basis: "daily", monthly_rate: "",
  shift_start: "09:00", shift_end: "18:00",
  license_number: "", // Driver-only, required for Drivers (LTO format, see lib/license.js)
  license_expiry: "", // Driver-only, required: the license must not have expired
  vehicle_plate: "", // Driver-only — ignored server-side for every other role
  _userRole: "", // display-only, set when editing — lets the Edit modal
                 // show "Driver" even though Driver has no sub_role
};

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

  const [faceFor, setFaceFor]         = useState(null); // employee whose face is being enrolled

  const [roleFilter, setRoleFilter]   = useState("all");
  const [statusView, setStatusView]   = useState("active"); // active | inactive (archived)
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
      const res = await fetch(`${API_BASE}/employees?status=${statusView}`, { headers: authHeaders });
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
  }, [statusView]);

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
      const haystack = `${e.employee_id} ${fullName(e)} ${e.position} ${e.department ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  // Employee ID is the main search key: ID matches come first.
  const qId = search.trim().toLowerCase();
  if (qId) filtered.sort((a, b) => Number(String(b.employee_id).toLowerCase().includes(qId)) - Number(String(a.employee_id).toLowerCase().includes(qId)));
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
  // applicant (name, mobile, address, position), then the state is cleared so a
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
      // The address given on the applicant record, if any
      block_lot: a.block_lot || "", street: a.street || "", subdivision: a.subdivision || "",
      barangay: a.barangay || "", barangay_code: a.barangay_code || "", city: a.city || "",
      province: a.province || "", region: a.region || "", postal_code: a.postal_code || "",
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
      region: emp.region || "",
      barangay_code: emp.barangay_code || "",
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
      employment_status: emp.employment_status || "regular",
      pay_basis: emp.pay_basis || "daily",
      monthly_rate: emp.monthly_rate != null ? String(Number(emp.monthly_rate)) : "",
      shift_start: (emp.shift_start || "09:00").slice(0, 5),
      shift_end: (emp.shift_end || "18:00").slice(0, 5),
      sub_role: emp.user?.sub_role || "",  // display-only in edit mode
      vehicle_plate: emp.vehicle_plate || "",
      license_number: emp.license_number || "",
      license_expiry: emp.license_expiry ? String(emp.license_expiry).slice(0, 10) : "",
      _userRole: emp.user?.role || "",     // needed to detect Driver, who has no sub_role
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setFormErrors({}); setFromApplicant(null); };

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);
  // Name, mobile number and address read from a PDF or Word resume
  const handleScan = (result) => setForm((f) => ({
    ...f,
    ...filledFrom(result, { first_name: "first_name", middle_initial: "middle_initial", last_name: "last_name", suffix: "suffix", phone: "phone" }),
  }));
  // License number and expiry read from a Driver's license (the name only when not typed yet)
  const handleLicenseScan = (result) => setForm((f) => ({
    ...f,
    ...filledFrom(result, f.first_name || f.last_name
      ? { license_number: "license_number", license_expiry: "license_expiry" }
      : { first_name: "first_name", middle_initial: "middle_initial", last_name: "last_name", suffix: "suffix", license_number: "license_number", license_expiry: "license_expiry" }),
  }));

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
    // The password is made from the last name and the mobile number, so a
    // new employee needs a mobile number.
    if (editingId === null && !noAccountForm && !form.phone) {
      setFormErrors({ phone: ["Enter the mobile number. The password uses its last two digits."] });
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
    if (isDriverForm) {
      const bad = {};
      if (licenseError(form.license_number)) bad.license_number = [licenseError(form.license_number)];
      // An unchanged saved date is not checked again (the server does the same).
      if (!editingId && expiryError(form.license_expiry)) bad.license_expiry = [expiryError(form.license_expiry)];
      if (Object.keys(bad).length) {
        setFormErrors(bad);
        return;
      }
    }
    if (form.postal_code && !/^\d{4}$/.test(form.postal_code)) {
      setFormErrors({ postal_code: ["Postal code must be 4 digits."] });
      return;
    }
    if (form.date_hired > addDaysStr(14)) {
      setFormErrors({ date_hired: ["The hire date can be at most 14 days from today."] });
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
          province: form.province, region: form.region || null,
          barangay_code: form.barangay_code || null, postal_code: form.postal_code,
          position: form.position, department: form.department,
          daily_rate: Number(form.daily_rate) || 0, date_hired: form.date_hired,
          employment_type: form.employment_type,
          employment_status: form.employment_status, pay_basis: form.pay_basis,
          monthly_rate: form.pay_basis === "monthly" ? Number(form.monthly_rate) || null : null,
          shift_start: form.shift_start || null, shift_end: form.shift_end || null,
          sub_role: form.sub_role || null,
          vehicle_plate: form.sub_role === "driver" ? (form.vehicle_plate || null) : null,
          license_number: form.sub_role === "driver" ? (form.license_number || null) : null,
          license_expiry: form.sub_role === "driver" ? (form.license_expiry || null) : null,
        }
      : {
          first_name: form.first_name, middle_initial: form.middle_initial || null,
          last_name: form.last_name, suffix: form.suffix || null,
          phone: toStoredPhone(form.phone), block_lot: form.block_lot, street: form.street,
          subdivision: form.subdivision, barangay: form.barangay, city: form.city,
          province: form.province, region: form.region || null,
          barangay_code: form.barangay_code || null, postal_code: form.postal_code,
          position: form.position, department: form.department,
          daily_rate: Number(form.daily_rate) || 0,
          employment_type: form.employment_type,
          employment_status: form.employment_status, pay_basis: form.pay_basis,
          monthly_rate: form.pay_basis === "monthly" ? Number(form.monthly_rate) || null : null,
          shift_start: form.shift_start || null, shift_end: form.shift_end || null,
          vehicle_plate: form._userRole === "driver" ? (form.vehicle_plate || null) : null,
          license_number: form._userRole === "driver" ? (form.license_number || null) : null,
          license_expiry: form._userRole === "driver" ? (form.license_expiry || null) : null,
        };

    try {
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);

      if (res.status === 422 && data?.errors) {
        // Fields that show their own error under the input. Any other
        // field error is shown at the top so it is never silently hidden.
        const SHOWN = ["first_name", "middle_initial", "last_name", "suffix", "email", "phone", "department", "daily_rate", "street", "barangay", "city", "province", "region", "barangay_code", "block_lot", "subdivision", "postal_code", "position", "sub_role", "vehicle_plate", "license_number", "license_expiry", "shift", "employment_type", "date_hired", "employment_status", "pay_basis", "monthly_rate", "shift_start", "shift_end"];
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

  const handleReactivate = async (emp) => {
    try {
      const res = await fetch(`${API_BASE}/employees/${emp.id}/reactivate`, { method: "POST", headers: authHeaders });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
      toast.success(data?.message || `${fullName(emp)} is active again.`);
      await fetchEmployees();
    } catch (err) {
      toast.error(err.message || "Couldn't reactivate that employee.");
    }
  };

  const handleDeactivate = async (emp) => {
    try {
      const res = await fetch(`${API_BASE}/employees/${emp.id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setConfirmDeactivate(null);
      toast.success(`${fullName(emp)} was deactivated and moved to Archived.`);
      await fetchEmployees();
    } catch (err) {
      console.error("deactivate employee error:", err);
      toast.error("Couldn't deactivate that employee. Please try again.");
      setConfirmDeactivate(null);
    }
  };


  // Mobile number field: beside Email when adding (it is required then, since
  // the password uses it), in the address section when editing.
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
                placeholder="Employee ID or name"
                aria-label="Search by employee ID or name"
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

        {/* Filters: Active or Archived, role chips, and a button that puts employees with no enrolled face on top */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mr-2" role="group" aria-label="Active or archived">
            {[["active", "Active"], ["inactive", "Archived"]].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={statusView === key} onClick={() => setStatusView(key)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium cursor-pointer ${statusView === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
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
                      {emp.user?.role === "driver" && emp.license_number && (
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">DL: {emp.license_number}</div>
                      )}
                      {emp.user?.role === "driver" && emp.vehicle_plate && (
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">PN: {emp.vehicle_plate}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap font-mono text-[12px]">{shiftLabel(emp)}</td>
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
                      {!emp.is_active ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[11px] text-slate-400 text-right">
                          Inactive since {emp.deactivated_at ? new Date(emp.deactivated_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          {emp.deactivated_by?.name ? ` · by ${emp.deactivated_by.name}` : ""}
                        </span>
                        <button onClick={() => handleReactivate(emp)} className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 rounded-md text-[11px] font-semibold text-white cursor-pointer">
                          Reactivate
                        </button>
                      </div>
                      ) : (
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
                      )}
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
              <ScanDropZone kind="resume" onScan={handleScan} fills="name, mobile number and address" />
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
                      {defaultEmployeePassword(form.last_name, form.phone) ? (
                        <span className="font-mono font-semibold text-slate-800 select-all">{defaultEmployeePassword(form.last_name, form.phone)}</span>
                      ) : (
                        <span className="text-slate-400">Fill in the Last Name and Mobile Number</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Last name + last two digits of the mobile number + "!". Give it to the employee with their email.
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
                <AddressFields
                  value={form}
                  onChange={handleAddress}
                  required={addressRequired}
                  errors={formErrors}
                  inputClassName={inputCls}
                />
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
                <Field label="Pay Basis" required error={formErrors.pay_basis}>
                  <select required value={form.pay_basis} onChange={handleChange("pay_basis")} className={inputCls}>
                    <option value="daily">Daily rate</option>
                    <option value="monthly">Monthly rate</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {form.pay_basis === "monthly" ? (
                  <Field label="Monthly Rate (₱)" required error={formErrors.monthly_rate}>
                    <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.monthly_rate}
                      onChange={handleChange("monthly_rate")} placeholder="e.g. 16000" className={inputCls} />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">The daily rate is worked out from it (Admin Settings).</span>
                  </Field>
                ) : (
                  <Field label="Daily Rate (₱)" required error={formErrors.daily_rate}>
                    <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.daily_rate}
                      onChange={handleChange("daily_rate")} placeholder="e.g. 610" className={inputCls} />
                  </Field>
                )}
                <Field label="Employment Status" required error={formErrors.employment_status}>
                  <select required value={form.employment_status} onChange={handleChange("employment_status")} className={inputCls}>
                    <option value="probationary">Probationary</option>
                    <option value="regular">Regular</option>
                  </select>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Probationary staff cannot file leave; leave credits start once regular.</span>
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
                <ScanDropZone kind="license" onScan={handleLicenseScan} fills="license number and expiry date" />
              )}

              {isDriverForm && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Driver's License No." required error={formErrors.license_number || (form.license_number && licenseError(form.license_number) ? [licenseError(form.license_number)] : null)}>
                    <input
                      required
                      value={form.license_number}
                      onChange={(e) => setForm((f) => ({ ...f, license_number: formatLicense(e.target.value) }))}
                      placeholder="e.g. N01-23-456789"
                      maxLength={13}
                      inputMode="text"
                      autoCapitalize="characters"
                      className={`${inputCls} font-mono`}
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      LTO format: office code (letter + 2 digits), year, 6-digit serial.
                    </span>
                  </Field>
                  <Field label="License Expiry" required error={formErrors.license_expiry || (form.license_expiry && expiryError(form.license_expiry) ? [expiryError(form.license_expiry)] : null)}>
                    <input
                      required
                      type="date"
                      min={tomorrowStr()}
                      value={form.license_expiry}
                      onChange={handleChange("license_expiry")}
                      className={inputCls}
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      An expired license is not accepted.
                    </span>
                  </Field>
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
                <Field label="Employment Type" required error={formErrors.employment_type}>
                  <select required value={form.employment_type} onChange={handleChange("employment_type")} className={inputCls}>
                    <option value="regular">Regular</option>
                    <option value="contractual">Contractual</option>
                    <option value="part_time">Part-Time</option>
                  </select>
                </Field>
                <div aria-hidden="true" />
                <Field label="Shift Start" required error={formErrors.shift_start}>
                  <input type="time" data-native required value={form.shift_start} onChange={handleChange("shift_start")} className={inputCls} />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Late is counted from this time, to the minute.</span>
                </Field>
                <Field label="Shift End" required error={formErrors.shift_end}>
                  <input type="time" data-native required value={form.shift_end} onChange={handleChange("shift_end")} className={inputCls} />
                  {form.shift_start && form.shift_end && form.shift_end <= form.shift_start && (
                    <span className="text-[10px] text-cyan-600 mt-0.5 block">Overnight: ends the next day.</span>
                  )}
                </Field>
              </div>

              {!editingId && (
                <Field label="Date Hired" required error={formErrors.date_hired}>
                  <input required type="date" max={addDaysStr(14)} value={form.date_hired} onChange={handleChange("date_hired")} className={inputCls} />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Up to 14 days ahead. A future hire is left out of attendance, the kiosk and payroll until that date.</span>
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
              {fullName(confirmDeactivate)} ({confirmDeactivate.employee_id}) moves to Archived and their login stops working. Nothing is deleted: attendance and payroll history stay, and they can be reactivated with the same employee ID.
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
              Give these login details to <b className="text-slate-700">{createdAccount.name}</b>. They are shown only now.
              The employee sets a new password on first sign-in.
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
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const storageUrl = (p) => (p ? `${BACKEND_URL}/storage/${String(p).replace(/^\/+/, "")}` : null);
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
  const name = fullName(employee);
  const savedPhoto = enrolled && !photoBroken ? storageUrl(enrolled.photo_path) : null;
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
