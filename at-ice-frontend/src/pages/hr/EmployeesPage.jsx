import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import FaceCapture from "../../components/FaceCapture";
import PhoneInput from "../../components/PhoneInput";
import TimeSelect from "../../components/TimeSelect";
import LoginEmailChip from "../../components/LoginEmailChip";
import { toast } from "../../lib/toast";
import { MOBILE_REGEX, MOBILE_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList, SkeletonTableRows } from "../../components/Skeleton";
import { NAME_SUFFIXES, cleanInitial, fullName, shiftLabel } from "../../lib/names";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import AddressFields from "../../components/AddressFields";
import ScanDropZone from "../../components/ScanDropZone";
import DraftHint from "../../components/DraftHint";
import { useDraft } from "../../lib/useDraft";
import { biodataFilledFrom, filledFrom } from "../../lib/scanDocument";
import { formatLicense, licenseError, expiryError, tomorrowStr } from "../../lib/license";
import { formatDateTime } from "../../lib/time";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import DocumentDrop from "../../components/DocumentDrop";
import {
  CIVIL_STATUSES, EDUCATION_LEVELS, EMPTY_BIODATA, EXPIRY_ALERT_DAYS, GOV_IDS, RESTRICTIONS, SEXES,
  biodataFrom, biodataPayload, daysUntil, formatGov, govComplete, uploadWithProgress,
} from "../../lib/biodata";
import { printBiodata } from "../../lib/printBiodata";
import FilterSelect from "../../components/FilterSelect";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { Icon } from "../../components/icons";

const API_BASE = "/api";

const SearchIcon  = () => <Icon name="search" size={14} />;
const PlusIcon    = () => <Icon name="plus" size={14} />;
const EditIcon    = () => <Icon name="edit" size={12} />;
const XIcon       = () => <Icon name="x" size={16} />;
const UserOffIcon = () => <Icon name="userOff" size={12} />;
const CameraIcon  = () => <Icon name="camera" size={12} />;
const EyeIcon     = () => <Icon name="eyeAlt" size={12} />;
const FaceOkIcon  = () => <Icon name="faceOk" size={11} strokeWidth={2.4} />;
const FaceNoIcon  = () => <Icon name="faceNo" size={11} strokeWidth={2.4} />;
const SortIcon    = () => <Icon name="sort" size={12} />;

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

// Add/Edit Employee is a six-step form (owner, 2026-10-20). An error on save
// opens the step that holds the field.
const FORM_STEPS = ["Personal", "Contact", "Payroll", "Technical", "History", "Attachments"];
const STEP_OF_FIELD = {
  first_name: 0, middle_initial: 0, last_name: 0, suffix: 0, birth_date: 0, sex: 0, civil_status: 0, nationality: 0, place_of_birth: 0,
  phone: 1, personal_email: 1, block_lot: 1, street: 1, subdivision: 1, barangay: 1, city: 1, province: 1, region: 1, barangay_code: 1, postal_code: 1,
  emergency_name: 1, emergency_relationship: 1, emergency_phone: 1,
  sss_no: 2, tin_no: 2, philhealth_no: 2, pagibig_no: 2, pay_basis: 2, daily_rate: 2, monthly_rate: 2,
  position: 3, department: 3, sub_role: 3, employment_status: 3, employment_type: 3, shift: 3, shift_start: 3, shift_end: 3, date_hired: 3,
  license_number: 3, license_expiry: 3, license_restrictions: 3, vehicle_plate: 3,
  education_level: 4, school: 4, course: 4, year_graduated: 4, work_history: 4,
};
const firstStepOf = (errors) => Math.min(99, ...Object.keys(errors).map((k) => STEP_OF_FIELD[k.split(".")[0]] ?? 99));

// License expiry reminder: amber within EXPIRY_ALERT_DAYS, rose once expired
function ExpiryBadge({ date }) {
  const d = daysUntil(date);
  if (d == null || d > EXPIRY_ALERT_DAYS) return <span className="text-[10px] text-slate-400 mt-0.5 block">An expired license is not accepted.</span>;
  return (
    <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${d < 0 ? "bg-rose-100 border-rose-200 text-rose-800" : "bg-amber-100 border-amber-200 text-amber-800"}`}>
      {d < 0 ? "Expired" : d === 0 ? "Expires today" : `Expires in ${d} day${d === 1 ? "" : "s"}`}
    </span>
  );
}

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
  ...EMPTY_BIODATA, // personal, contact, government numbers, education and work (lib/biodata.js)
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

  // Add/Edit modal: kept as a draft while open, so a refresh reopens it as it was.
  const formDraft = useDraft("employees:form", { modalOpen: false, editingId: null, form: emptyForm, fromApplicant: null }, { when: (v) => v.modalOpen });
  const { modalOpen, editingId, form, fromApplicant } = formDraft.values;
  const { modalOpen: setModalOpen, editingId: setEditingId, form: setForm, fromApplicant: setFromApplicant } = formDraft.set;
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]       = useState(false);
  const [step, setStep]           = useState(0);
  // Attachments: queued (new employee, uploaded once saved) or attached (edit)
  const [docItems, setDocItems]   = useState([]);

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
    setStep(0);
    setDocItems([]);
    setModalOpen(true);
  };

  // Opened from Interviews after hiring: Add Employee, filled in from the
  // applicant (name, mobile, address, position), then the state is cleared so a
  // reload does not open it again.
  const location = useLocation();
  const navigate = useNavigate();
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
      // personal details, education, work and license given on /apply
      ...biodataFrom(a),
      license_number: a.license_number || "",
      license_expiry: a.license_expiry ? String(a.license_expiry).slice(0, 10) : "",
    });
    setFormErrors({});
    setStep(0);
    setDocItems([]);
    setFromApplicant(a);
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, setEditingId, setForm, setFromApplicant, setModalOpen]);

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
      ...biodataFrom(emp),
    });
    setFormErrors({});
    setStep(0);
    setDocItems([]);
    setModalOpen(true);
    fetch(`${API_BASE}/employees/${emp.id}/documents`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setDocItems(list.map((d) => ({ key: `d${d.id}`, type: d.type, name: d.original_name, size: d.size, status: "done", progress: 100, doc: d }))))
      .catch(() => {});
  };

  const closeModal = () => { setModalOpen(false); setFormErrors({}); setFromApplicant(null); setStep(0); setDocItems([]); };

  // Attachments (step 6): a new employee's files wait for the save; an
  // existing employee's are uploaded at once. Each shows its progress.
  const patchDoc = (key, patch) => setDocItems((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const uploadDoc = async (employeeId, it) => {
    const fd = new FormData();
    fd.append("type", it.type);
    fd.append("file", it.file);
    patchDoc(it.key, { status: "uploading", progress: 0 });
    try {
      const res = await uploadWithProgress(`${API_BASE}/employees/${employeeId}/documents`, fd, (progress) => patchDoc(it.key, { progress }));
      patchDoc(it.key, { status: "done", progress: 100, doc: res.document, file: undefined });
      return true;
    } catch (err) {
      patchDoc(it.key, { status: "error", error: err.message });
      return false;
    }
  };
  const addDocs = (type, files) => {
    const items = files.map((file, i) => ({ key: `n${Date.now()}-${i}-${file.name}`, type, name: file.name, size: file.size, file, progress: 0, status: editingId ? "uploading" : "queued" }));
    setDocItems((list) => [...list.filter((x) => !(type === "photo" && x.type === "photo" && x.status !== "done")), ...items]);
    if (editingId) items.forEach((it) => uploadDoc(editingId, it));
  };
  const removeDoc = async (it) => {
    if (it.status === "done" && it.doc) {
      const res = await fetch(`${API_BASE}/employees/${editingId}/documents/${it.doc.id}`, { method: "DELETE", headers: authHeaders }).catch(() => null);
      if (!res?.ok) { toast.error(`Couldn't remove ${it.name}. Try again.`); return; }
      toast.success(`${it.name} was removed.`);
    }
    setDocItems((list) => list.filter((x) => x.key !== it.key));
  };

  // The saved biodata as a hard copy (photo: the 2x2 document or the Face ID)
  const printEmployeeBiodata = async (emp) => {
    if (!emp) return;
    const docs = await fetch(`${API_BASE}/employees/${emp.id}/documents`, { headers: authHeaders }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    printBiodata(emp, docs);
  };

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm]);
  // Name, mobile number and address read from a PDF or Word resume
  // Everything the resume shows: name, mobile, address, personal details,
  // emergency contact, highest attainment, school and work history.
  const handleScan = (result) => setForm((f) => ({
    ...f,
    ...filledFrom(result, { first_name: "first_name", middle_initial: "middle_initial", last_name: "last_name", suffix: "suffix", phone: "phone" }),
    ...biodataFilledFrom(result, f),
  }));
  // License number and expiry read from a Driver's license (the name only when not typed yet)
  const handleLicenseScan = (result) => setForm((f) => ({
    ...f,
    ...filledFrom(result, f.first_name || f.last_name
      ? { license_number: "license_number", license_expiry: "license_expiry" }
      : { first_name: "first_name", middle_initial: "middle_initial", last_name: "last_name", suffix: "suffix", license_number: "license_number", license_expiry: "license_expiry" }),
    // Restriction codes, and the birthday, sex and nationality printed on the license
    ...biodataFilledFrom(result, f),
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

  // Show errors and open the first step that has one
  const showErrors = (errors) => {
    setFormErrors(errors);
    const s = firstStepOf(errors);
    if (s < 99) setStep(s);
  };

  // What the step needs before Next (the server checks everything again)
  const validateStep = (s) => {
    const bad = {};
    if (s === 0) {
      if (!form.first_name.trim()) bad.first_name = ["Enter the first name."];
      if (!form.last_name.trim()) bad.last_name = ["Enter the last name."];
    }
    if (s === 1) {
      if (form.phone && !MOBILE_REGEX.test(form.phone)) bad.phone = [MOBILE_MESSAGE];
      if (form.emergency_phone && !MOBILE_REGEX.test(form.emergency_phone)) bad.emergency_phone = [MOBILE_MESSAGE];
      if (addressRequired) for (const f of ["street", "barangay", "city", "province"]) if (!String(form[f] || "").trim()) bad[f] = ["Required."];
      if (form.postal_code && !/^\d{4}$/.test(form.postal_code)) bad.postal_code = ["Postal code must be 4 digits."];
    }
    if (s === 2) {
      for (const g of GOV_IDS) if (!govComplete(g, form[g.key])) bad[g.key] = [`Enter all digits (${g.placeholder}).`];
      if (form.pay_basis === "monthly" ? !form.monthly_rate : form.daily_rate === "") bad[form.pay_basis === "monthly" ? "monthly_rate" : "daily_rate"] = ["Enter the rate."];
    }
    if (s === 3) {
      if (!editingId && !form.position) bad.position = ["Choose the position."];
      if (!editingId && !form.date_hired) bad.date_hired = ["Enter the hire date."];
      if (!editingId && form.date_hired > addDaysStr(14)) bad.date_hired = ["The hire date can be at most 14 days from today."];
      if (isDriverForm) {
        if (licenseError(form.license_number)) bad.license_number = [licenseError(form.license_number)];
        if (!editingId && expiryError(form.license_expiry)) bad.license_expiry = [expiryError(form.license_expiry)];
      }
    }
    return bad;
  };
  const goNext = () => {
    const bad = validateStep(step);
    if (Object.keys(bad).length) { setFormErrors(bad); return; }
    setFormErrors({});
    setStep((x) => Math.min(FORM_STEPS.length - 1, x + 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    // every step is checked before saving
    for (let s = 0; s < FORM_STEPS.length; s++) {
      const bad = validateStep(s);
      if (Object.keys(bad).length) { showErrors(bad); return; }
    }

    if (form.phone && !MOBILE_REGEX.test(form.phone)) {
      showErrors({ phone: [MOBILE_MESSAGE] });
      return;
    }
    // A new employee with a login account needs a mobile number, so HR can reach them.
    if (editingId === null && !noAccountForm && !form.phone) {
      showErrors({ phone: ["Enter the mobile number of the employee."] });
      return;
    }
    if (addressRequired) {
      const missing = {};
      for (const f of ["street", "barangay", "city", "province"]) {
        if (!String(form[f] || "").trim()) missing[f] = ["Required when an address is filled in."];
      }
      if (Object.keys(missing).length) {
        showErrors(missing);
        return;
      }
    }
    if (isDriverForm) {
      const bad = {};
      if (licenseError(form.license_number)) bad.license_number = [licenseError(form.license_number)];
      // An unchanged saved date is not checked again (the server does the same).
      if (!editingId && expiryError(form.license_expiry)) bad.license_expiry = [expiryError(form.license_expiry)];
      if (Object.keys(bad).length) {
        showErrors(bad);
        return;
      }
    }
    if (form.postal_code && !/^\d{4}$/.test(form.postal_code)) {
      showErrors({ postal_code: ["Postal code must be 4 digits."] });
      return;
    }
    if (form.date_hired > addDaysStr(14)) {
      showErrors({ date_hired: ["The hire date can be at most 14 days from today."] });
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
          ...biodataPayload(form, { withGov: true }),
          applicant_id: fromApplicant?.id || null,
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
          ...biodataPayload(form, { withGov: true }),
        };

    try {
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);

      if (res.status === 422 && data?.errors) {
        // Fields that show their own error under the input. Any other
        // field error is shown at the top so it is never silently hidden.
        const SHOWN = [...Object.keys(STEP_OF_FIELD), "first_name", "middle_initial", "last_name", "suffix", "email", "phone", "department", "daily_rate", "street", "barangay", "city", "province", "region", "barangay_code", "block_lot", "subdivision", "postal_code", "position", "sub_role", "vehicle_plate", "license_number", "license_expiry", "shift", "employment_type", "date_hired", "employment_status", "pay_basis", "monthly_rate", "shift_start", "shift_end"];
        const hidden = Object.keys(data.errors).filter((k) => !SHOWN.includes(k));
        showErrors(hidden.length ? { ...data.errors, _general: data.errors[hidden[0]] } : data.errors);
        return;
      }
      if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);

      // a new employee's attachments upload now, one at a time with progress
      if (isCreate && data?.employee?.id) {
        let failed = 0;
        for (const it of docItems.filter((x) => x.status === "queued" || x.status === "error")) {
          if (!(await uploadDoc(data.employee.id, it))) failed++;
        }
        if (failed) toast.error(`${failed} file${failed === 1 ? "" : "s"} could not be attached. Add ${failed === 1 ? "it" : "them"} again from Edit.`);
      }
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
      showErrors({ _general: [err.message || "Request failed. Try again."] });
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
  const pager = usePagination(filtered);

  // Team summary for the KPI cards
  const enrolledCount = employees.length - unenrolledCount;
  const probationary = employees.filter((e) => e.employment_status === "probationary").length;
  const licenseSoon = employees.filter((e) => { const d = daysUntil(e.license_expiry); return d != null && d <= EXPIRY_ALERT_DAYS; }).length;
  const shareOf = (n) => (employees.length ? n / employees.length : 0);

  return (
    <HrLayout pageTitle="Employees" breadcrumb="HRIS / Employees">
      <KpiGrid cols={5}>
        <KpiCard label={statusView === "inactive" ? "Archived" : "Active staff"} icon="users" tone="cyan" value={employees.length} sub={`${Object.keys(roleCounts).length} roles`} />
        <KpiCard label="Face enrolled" icon="check" tone="emerald" value={enrolledCount} sub="Can time in at the kiosk" bar={shareOf(enrolledCount)} />
        <KpiCard label="Not enrolled" icon="alert" tone={unenrolledCount ? "rose" : "emerald"} value={unenrolledCount} sub={unenrolledCount ? "Enroll their face to time in" : "Everyone can time in"} bar={shareOf(unenrolledCount)} onClick={() => setUnenrolledFirst((v) => !v)} active={unenrolledFirst} />
        <KpiCard label="Probationary" icon="clock" tone="amber" value={probationary} sub={`${employees.length - probationary} regular`} bar={shareOf(probationary)} />
        <KpiCard label="Licenses expiring" icon="key" tone={licenseSoon ? "rose" : "violet"} value={licenseSoon} sub={`Within ${EXPIRY_ALERT_DAYS} days or already expired`} />
      </KpiGrid>

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
          <FilterSelect label="Show" value={statusView} onChange={setStatusView}
            options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Archived" }]} />
          <FilterSelect label="Role" value={roleFilter} onChange={setRoleFilter}
            options={ROLE_FILTERS.map((r) => ({ value: r, label: r === "all" ? "All" : roleLabel(r), count: r === "all" ? employees.length : roleCounts[r] || 0 }))} />
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
                pager.pageItems.map((emp) => (
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
                        <button data-no-confirm
                          onClick={() => printEmployeeBiodata(emp)}
                          data-tip="Prints this employee's biodata as a hard copy"
                          className="flex items-center gap-1 px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Biodata
                        </button>
                        <button
                          onClick={() => openEdit(emp)}
                          className="flex items-center gap-1 px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <EditIcon /> Edit
                        </button>
                        <button data-no-confirm
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
        <Pagination pager={pager} />
      </div>

      {/* ── ADD / EDIT MODAL: six steps (owner, 2026-10-20) ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.09]">
              <div className="text-[15px] font-semibold text-slate-800">
                {editingId ? `Edit Employee · ${[form.first_name, form.last_name].filter(Boolean).join(" ")}` : "Add Employee"}
              </div>
              <div className="flex items-center gap-2">
                {editingId && (
                  <button type="button" data-no-confirm data-tip="Prints the saved biodata of this employee"
                    onClick={() => printEmployeeBiodata(employees.find((e) => e.id === editingId))}
                    className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer">
                    Print biodata
                  </button>
                )}
                <button type="button" onClick={closeModal} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                  <XIcon />
                </button>
              </div>
            </div>

            {/* Step bar: Personal → Contact → Payroll → Technical → History → Attachments */}
            <nav aria-label="Form steps" className="px-5 pt-4">
              <ol className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-6 gap-2">
                {FORM_STEPS.map((label, i) => {
                  const state = i === step ? "current" : i < step ? "done" : "todo";
                  // a passed step is done only when it has everything it needs
                  const hasError = Object.keys(formErrors).some((k) => STEP_OF_FIELD[k.split(".")[0]] === i)
                    || (i < step && Object.keys(validateStep(i)).length > 0);
                  return (
                    <li key={label}>
                      <button type="button" onClick={() => setStep(i)} aria-current={state === "current" ? "step" : undefined} data-no-confirm
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[11.5px] font-semibold transition-colors cursor-pointer ${
                          state === "current" ? "border-cyan-500 bg-cyan-50 text-cyan-800"
                            : hasError ? "border-rose-200 bg-rose-50 text-rose-700"
                            : state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-black/[0.09] text-slate-500"}`}>
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full grid place-items-center text-[10px] ${state === "current" ? "bg-cyan-600 text-white" : state === "done" && !hasError ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {state === "done" && !hasError ? "✓" : i + 1}
                        </span>
                        <span className="truncate" title={label}>{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3.5" noValidate>
              <DraftHint draft={formDraft} onDiscard={() => setFormErrors({})} />
              {fromApplicant && !editingId && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg px-3 py-2">
                  Hired applicant <span className="font-semibold">{fromApplicant.name}</span> ({fromApplicant.position_applied}). Check the details on every step and fill in the rest to make them an employee.
                </div>
              )}
              {formErrors._general && (
                <div className="px-3 py-2 bg-red-500/[0.06] border border-red-500/20 rounded-md text-xs text-red-600">
                  {formErrors._general[0]}
                </div>
              )}

              {/* 1. PERSONAL */}
              {step === 0 && (
                <>
                  <ScanDropZone kind="resume" onScan={handleScan} fills="name, mobile number, address, birthday, sex, civil status, emergency contact, highest attainment, school and work history" />
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                    <Field label="First Name" required error={formErrors.first_name}>
                      <input required value={form.first_name} onChange={handleChange("first_name")} className={inputCls} />
                    </Field>
                    <Field label="M.I." error={formErrors.middle_initial}>
                      <input value={form.middle_initial} onChange={(e) => setForm((f) => ({ ...f, middle_initial: cleanInitial(e.target.value) }))}
                        maxLength={2} placeholder="e.g. D" aria-label="Middle initial" autoCapitalize="characters" className={inputCls} />
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Date of Birth" error={formErrors.birth_date}>
                      <input type="date" max={addDaysStr(-15 * 365)} value={form.birth_date} onChange={handleChange("birth_date")} className={inputCls} />
                    </Field>
                    <Field label="Sex" error={formErrors.sex}>
                      <select value={form.sex} onChange={handleChange("sex")} className={inputCls}>
                        <option value="">Choose</option>
                        {SEXES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Civil Status" error={formErrors.civil_status}>
                      <select value={form.civil_status} onChange={handleChange("civil_status")} className={inputCls}>
                        <option value="">Choose</option>
                        {CIVIL_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nationality" error={formErrors.nationality}>
                      <input value={form.nationality} onChange={handleChange("nationality")} maxLength={50} className={inputCls} />
                    </Field>
                    <Field label="Place of Birth" error={formErrors.place_of_birth}>
                      <input value={form.place_of_birth} onChange={handleChange("place_of_birth")} maxLength={120} placeholder="City or municipality, province" className={inputCls} />
                    </Field>
                  </div>
                </>
              )}

              {/* 2. CONTACT */}
              {step === 1 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {phoneField}
                    <Field label="Personal Email" error={formErrors.personal_email}>
                      <input type="email" value={form.personal_email} onChange={handleChange("personal_email")} placeholder="name@gmail.com" className={inputCls} />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Not the login. The login email is made automatically.</span>
                    </Field>
                  </div>
                  {editingId && (
                    <div className="text-[11px] text-slate-400 -mt-1.5">
                      {form.email
                        ? <>Login: {form.email} · To fix it, click the pencil beside the email in the list.</>
                        : "No system account (attendance only)."}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 text-[12px] font-semibold text-slate-700 mt-1">Address</div>
                    {form._legacyAddress && !addressInUse && (
                      <p className="col-span-2 -mt-1 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                        Saved address (old format): {form._legacyAddress}. Fill in the fields below to replace it.
                      </p>
                    )}
                    <AddressFields value={form} onChange={handleAddress} required={addressRequired} errors={formErrors} inputClassName={inputCls} />
                  </div>
                  <div className="text-[12px] font-semibold text-slate-700 mt-1">Emergency contact</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Name" error={formErrors.emergency_name}>
                      <input value={form.emergency_name} onChange={handleChange("emergency_name")} maxLength={120} className={inputCls} />
                    </Field>
                    <Field label="Relationship" error={formErrors.emergency_relationship}>
                      <input value={form.emergency_relationship} onChange={handleChange("emergency_relationship")} maxLength={40} placeholder="e.g. Mother" className={inputCls} />
                    </Field>
                    <Field label="Mobile Number" error={formErrors.emergency_phone}>
                      <PhoneInput value={form.emergency_phone} onChange={(emergency_phone) => setForm((f) => ({ ...f, emergency_phone }))} className={inputCls}
                        invalid={!!form.emergency_phone && !MOBILE_REGEX.test(form.emergency_phone)} />
                    </Field>
                  </div>
                </>
              )}

              {/* 3. PAYROLL: government numbers and pay */}
              {step === 2 && (
                <>
                  <div className="text-[12px] font-semibold text-slate-700">Government numbers</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {GOV_IDS.map((g) => (
                      <Field key={g.key} label={g.label} error={formErrors[g.key] || (!govComplete(g, form[g.key]) ? [`Enter all digits (${g.placeholder}).`] : null)}>
                        <input value={form[g.key]} inputMode="numeric" placeholder={g.placeholder} maxLength={g.placeholder.length}
                          onChange={(e) => setForm((f) => ({ ...f, [g.key]: formatGov(g.groups, e.target.value) }))} className={`${inputCls} font-mono`} />
                      </Field>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 -mt-1.5">Typed as digits; dashes are added for you. A 9-digit TIN gets the 000 branch code.</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Pay Basis" required error={formErrors.pay_basis}>
                      <select required value={form.pay_basis} onChange={handleChange("pay_basis")} className={inputCls}>
                        <option value="daily">Daily rate</option>
                        <option value="monthly">Monthly rate</option>
                      </select>
                    </Field>
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
                  </div>
                </>
              )}

              {/* 4. TECHNICAL: position, schedule, Driver's license */}
              {step === 3 && (
                <>
                  <Field label="Position" required error={formErrors.position}>
                    {editingId ? (
                      <input readOnly value={form.position || "—"} className={`${inputCls} bg-slate-100 text-slate-500`} />
                    ) : (
                      <select required value={form.position} onChange={handlePositionChange} className={inputCls}>
                        <option value="">Select position</option>
                        {Object.keys(POSITION_ROLES).map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </Field>
                  {noAccountForm && (
                    <p className="-mt-1 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-[11px] text-blue-700">
                      {form.position}s have no system account. They are recorded for attendance (face enrollment) and payroll only.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Department" error={formErrors.department}>
                      <select value={form.department} onChange={handleChange("department")} aria-label="Department" className={inputCls}>
                        <option value="">Choose a department</option>
                        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        {form.department && !DEPARTMENTS.includes(form.department) && <option value={form.department}>{form.department} (old)</option>}
                      </select>
                    </Field>
                    <Field label="Employee Role (set from Position)" error={formErrors.sub_role}>
                      <input readOnly className={`${inputCls} bg-slate-100 text-slate-500`}
                        value={roleLabel(form.sub_role || (form._userRole === "driver" ? "driver" : POSITION_ROLES[form.position] || ""))} />
                    </Field>
                    <Field label="Employment Status" required error={formErrors.employment_status}>
                      <select required value={form.employment_status} onChange={handleChange("employment_status")} className={inputCls}>
                        <option value="probationary">Probationary</option>
                        <option value="regular">Regular</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Probationary staff cannot file leave; leave credits start once regular.</span>
                    </Field>
                    <Field label="Employment Type" required error={formErrors.employment_type}>
                      <select required value={form.employment_type} onChange={handleChange("employment_type")} className={inputCls}>
                        <option value="regular">Regular</option>
                        <option value="contractual">Contractual</option>
                        <option value="part_time">Part-Time</option>
                      </select>
                    </Field>
                    <Field label="Shift Start" required error={formErrors.shift_start}>
                      <TimeSelect required value={form.shift_start} onChange={handleChange("shift_start")} selectClassName={timeSelectCls} />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Late is counted from this time, to the minute.</span>
                    </Field>
                    <Field label="Shift End" required error={formErrors.shift_end}>
                      <TimeSelect required value={form.shift_end} onChange={handleChange("shift_end")} selectClassName={timeSelectCls} />
                      {form.shift_start && form.shift_end && form.shift_end <= form.shift_start && (
                        <span className="text-[10px] text-cyan-600 mt-0.5 block">Overnight: ends the next day.</span>
                      )}
                    </Field>
                    {!editingId && (
                      <Field label="Date Hired" required error={formErrors.date_hired}>
                        <input required type="date" max={addDaysStr(14)} value={form.date_hired} onChange={handleChange("date_hired")} className={inputCls} />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">Up to 14 days ahead. A future hire is left out of attendance, the kiosk and payroll until that date.</span>
                      </Field>
                    )}
                  </div>

                  {isDriverForm && (
                    <>
                      <div className="text-[12px] font-semibold text-slate-700 mt-1">Driver's license</div>
                      <ScanDropZone kind="license" onScan={handleLicenseScan} fills="license number, expiry date and restriction codes" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Driver's License No." required error={formErrors.license_number || (form.license_number && licenseError(form.license_number) ? [licenseError(form.license_number)] : null)}>
                          <input required value={form.license_number} onChange={(e) => setForm((f) => ({ ...f, license_number: formatLicense(e.target.value) }))}
                            placeholder="e.g. N01-23-456789" maxLength={13} autoCapitalize="characters" className={`${inputCls} font-mono`} />
                          <span className="text-[10px] text-slate-400 mt-0.5 block">LTO format: office code (letter + 2 digits), year, 6-digit serial.</span>
                        </Field>
                        <Field label="License Expiry" required error={formErrors.license_expiry || (form.license_expiry && expiryError(form.license_expiry) ? [expiryError(form.license_expiry)] : null)}>
                          <input required type="date" min={tomorrowStr()} value={form.license_expiry} onChange={handleChange("license_expiry")} className={inputCls} />
                          <ExpiryBadge date={form.license_expiry} />
                        </Field>
                      </div>
                      <Field label="Restriction Codes" error={formErrors.license_restrictions}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 pt-1">
                          {RESTRICTIONS.map(([code, label]) => (
                            <label key={code} className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
                              <input type="checkbox" checked={(form.license_restrictions || []).includes(code)}
                                onChange={(e) => setForm((f) => ({ ...f, license_restrictions: e.target.checked ? [...(f.license_restrictions || []), code] : (f.license_restrictions || []).filter((c) => c !== code) }))} />
                              <span><b className="font-mono">{code}</b> · {label}</span>
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Field label="Vehicle Plate Number" error={formErrors.vehicle_plate}>
                        <input value={form.vehicle_plate} onChange={handleChange("vehicle_plate")} placeholder="e.g. V7824" className={inputCls} />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">Optional. Shown to customers beside the driver's name.</span>
                      </Field>
                    </>
                  )}
                </>
              )}

              {/* 5. HISTORY: education and work */}
              {step === 4 && (
                <>
                  <div className="text-[12px] font-semibold text-slate-700">Education</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Highest Attainment" error={formErrors.education_level}>
                      <select value={form.education_level} onChange={handleChange("education_level")} className={inputCls}>
                        <option value="">Choose</option>
                        {EDUCATION_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Year Graduated" error={formErrors.year_graduated}>
                      <input type="number" min="1950" max={new Date().getFullYear() + 6} inputMode="numeric" value={form.year_graduated}
                        onChange={handleChange("year_graduated")} placeholder="e.g. 2016" className={inputCls} />
                    </Field>
                    <Field label="School" error={formErrors.school}>
                      <input value={form.school} onChange={handleChange("school")} maxLength={160} className={inputCls} />
                    </Field>
                    <Field label="Course or Strand" error={formErrors.course}>
                      <input value={form.course} onChange={handleChange("course")} maxLength={160} className={inputCls} />
                    </Field>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[12px] font-semibold text-slate-700">Work history</span>
                    {(form.work_history || []).length < 5 && (
                      <button type="button" data-no-confirm onClick={() => setForm((f) => ({ ...f, work_history: [...(f.work_history || []), { company: "", position: "", from: "", to: "" }] }))}
                        className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50">+ Add work</button>
                    )}
                  </div>
                  {(form.work_history || []).length === 0 && <div className="text-[12px] text-slate-400">No previous work added.</div>}
                  {(form.work_history || []).map((w, i) => {
                    const set = (k) => (e) => setForm((f) => ({ ...f, work_history: (f.work_history || []).map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
                    return (
                      // Company and position on one row, the dates and Remove under them,
                      // so long names and month names are never cut off
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-black/[0.09] p-2.5">
                        <Field label="Company" error={formErrors[`work_history.${i}.company`]}><input value={w.company} onChange={set("company")} title={w.company} className={inputCls} /></Field>
                        <Field label="Position"><input value={w.position} onChange={set("position")} title={w.position} className={inputCls} /></Field>
                        <div className="sm:col-span-2 grid grid-cols-1 min-[420px]:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <Field label="From"><input type="month" value={w.from} onChange={set("from")} className={inputCls} /></Field>
                          <Field label="To"><input type="month" value={w.to} onChange={set("to")} className={inputCls} /></Field>
                          <button type="button" onClick={() => setForm((f) => ({ ...f, work_history: (f.work_history || []).filter((_, j) => j !== i) }))}
                            className="justify-self-end px-2.5 py-1.5 text-[11px] text-rose-700 hover:underline">Remove</button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* 6. ATTACHMENTS */}
              {step === 5 && (
                <>
                  {fromApplicant && !editingId && (
                    <p className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-[11px] text-blue-700">
                      The applicant's resume and documents are attached when the employee is saved.
                    </p>
                  )}
                  <DocumentDrop items={docItems} onAdd={addDocs} onRemove={removeDoc} disabled={saving}
                    viewUrl={(doc) => `${API_BASE}/employees/${editingId}/documents/${doc.id}`} />
                  {!editingId && !noAccountForm && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-[11px] text-slate-500">Login email (made automatically)</span>
                        <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px] min-w-0">
                          {emailPreview(form) ? <span className="font-mono text-slate-800 truncate">{emailPreview(form)}</span> : <span className="text-slate-400">Fill in the Last Name</span>}
                        </div>
                        <span className="text-[10px] text-slate-400 leading-snug">#### is the employee number, given when saved.</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-500">Password (made automatically)</span>
                        <div className="flex items-center min-h-[40px] px-3 rounded-lg bg-slate-50 border border-black/[0.09] text-[13px]">
                          <span className="text-slate-400">A random one-time password is made when you save</span>
                        </div>
                        <span className="text-[10px] text-slate-400 leading-snug">It is shown once, right after saving. Give it to the employee with their email. They must change it on first sign-in.</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/[0.09] mt-1">
                <button type="button" onClick={closeModal} className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button type="button" data-no-confirm onClick={() => { setFormErrors({}); setStep(step - 1); }}
                      className="px-3.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-600 hover:bg-slate-50">Back</button>
                  )}
                  {step < FORM_STEPS.length - 1 && (
                    <button type="button" data-no-confirm onClick={goNext}
                      className={`px-4 py-1.5 rounded-md text-xs font-medium ${editingId ? "border border-black/[0.09] text-slate-700 hover:bg-slate-50" : "bg-cyan-500 hover:bg-cyan-600 text-white"}`}>Next</button>
                  )}
                  {(editingId || step === FORM_STEPS.length - 1) && (
                    <button type="submit" disabled={saving}
                      className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors">
                      {saving ? "Saving…" : editingId ? "Save Changes" : "Create Employee"}
                    </button>
                  )}
                </div>
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

const timeSelectCls = "px-2 py-1.5 border border-black/[0.09] rounded-md text-[13px] text-slate-800 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20";
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
const fmtDateTime = (d) =>
  d ? formatDateTime(d) : "—";

function FaceModal({ employee, authHeaders, onClose, onSaved }) {
  const [descriptor, setDescriptor] = useState(null);
  const [photo, setPhoto] = useState(null); // JPEG data URL of the captured face
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const enrolled = employee.face_data; // { id, employee_id, photo_path, created_at, updated_at } or null
  const [capturing, setCapturing] = useState(!enrolled);
  const [photoBroken, setPhotoBroken] = useState(false);
  const name = fullName(employee);
  // The enrolled picture is private: it is fetched with the login token and shown
  // from an in-memory URL (an <img src> cannot send the token).
  const [photoUrl, setPhotoUrl] = useState(null);
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
                <button data-no-confirm
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
