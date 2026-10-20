// Biodata shared by Add/Edit Employee (HR), the public /apply form and the
// printed biodata (owner, 2026-10-20). Same rules as App\Support\Biodata.

export const SEXES = [["male", "Male"], ["female", "Female"]];
export const CIVIL_STATUSES = [["single", "Single"], ["married", "Married"], ["widowed", "Widowed"], ["separated", "Separated"]];
export const EDUCATION_LEVELS = [
  ["elementary", "Elementary"], ["high_school", "High school"], ["senior_high", "Senior high school"],
  ["vocational", "Vocational / TESDA"], ["college_undergraduate", "College undergraduate"],
  ["college_graduate", "College graduate"], ["postgraduate", "Postgraduate"],
];
export const labelOf = (list, value) => list.find(([v]) => v === value)?.[1] || value || "";

// LTO restriction codes: the 2021 codes and the older numeric ones
export const RESTRICTIONS = [
  ["A", "Motorcycle"], ["A1", "Tricycle"], ["B", "Car up to 5,000 kg"], ["B1", "Van up to 5,000 kg"],
  ["B2", "Light truck up to 5,000 kg"], ["BE", "B with trailer"], ["C", "Truck over 5,000 kg"],
  ["CE", "Truck with trailer"], ["D", "Bus"],
  ["1", "Old 1: Motorcycle"], ["2", "Old 2: Up to 4,500 kg"], ["3", "Old 3: Over 4,500 kg"],
  ["4", "Old 4: Automatic up to 4,500 kg"], ["5", "Old 5: Automatic over 4,500 kg"],
  ["6", "Old 6: Articulated up to 1,600 kg"], ["7", "Old 7: Articulated up to 4,500 kg"], ["8", "Old 8: Articulated over 4,500 kg"],
];

// Government numbers, typed as digits and shown grouped
export const GOV_IDS = [
  { key: "sss_no", label: "SSS No.", groups: [2, 7, 1], placeholder: "XX-XXXXXXX-X" },
  { key: "tin_no", label: "TIN", groups: [3, 3, 3, 3], placeholder: "XXX-XXX-XXX-000" },
  { key: "philhealth_no", label: "PhilHealth No.", groups: [2, 9, 1], placeholder: "XX-XXXXXXXXX-X" },
  { key: "pagibig_no", label: "Pag-IBIG MID No.", groups: [4, 4, 4], placeholder: "XXXX-XXXX-XXXX" },
];

// Digits grouped as they are typed: "3412" -> "34-12"
export function formatGov(groups, value) {
  const max = groups.reduce((a, b) => a + b, 0);
  const digits = String(value || "").replace(/\D/g, "").slice(0, max);
  const parts = [];
  let at = 0;
  for (const g of groups) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + g));
    at += g;
  }
  return parts.join("-");
}

// Complete? (TIN may be 9 digits; the server adds the 000 branch code)
export function govComplete(id, value) {
  const n = String(value || "").replace(/\D/g, "").length;
  const max = id.groups.reduce((a, b) => a + b, 0);
  return n === 0 || n === max || (id.key === "tin_no" && n === 9);
}

// Days from today to a date (negative when past), or null
export function daysUntil(date) {
  if (!date) return null;
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
export const EXPIRY_ALERT_DAYS = 60;

export const DOCUMENT_TYPES = [
  { type: "resume", label: "Resume or CV", accept: ".pdf,.doc,.docx", hint: "PDF or Word" },
  { type: "photo", label: "2x2 photo", accept: "image/*", hint: "JPG, PNG or WebP", capture: "user" },
  { type: "nbi", label: "NBI clearance", accept: "image/*,application/pdf", hint: "PDF or picture" },
  { type: "government_id", label: "Government IDs", accept: "image/*,application/pdf", hint: "SSS, TIN, PhilHealth, Pag-IBIG cards" },
  { type: "diploma", label: "Diploma or transcript", accept: "image/*,application/pdf", hint: "PDF or picture" },
  { type: "other", label: "Other documents", accept: "image/*,application/pdf", hint: "PDF or picture" },
];

export const EMPTY_BIODATA = {
  birth_date: "", sex: "", civil_status: "", nationality: "Filipino", place_of_birth: "", personal_email: "",
  emergency_name: "", emergency_relationship: "", emergency_phone: "",
  education_level: "", school: "", course: "", year_graduated: "", work_history: [],
  license_restrictions: [],
  sss_no: "", tin_no: "", philhealth_no: "", pagibig_no: "",
};

// The biodata part of a record (employee or applicant) as form values
export function biodataFrom(rec = {}) {
  return {
    ...EMPTY_BIODATA,
    birth_date: rec.birth_date ? String(rec.birth_date).slice(0, 10) : "",
    sex: rec.sex || "", civil_status: rec.civil_status || "", nationality: rec.nationality || "Filipino",
    place_of_birth: rec.place_of_birth || "", personal_email: rec.personal_email || "",
    emergency_name: rec.emergency_name || "", emergency_relationship: rec.emergency_relationship || "",
    emergency_phone: rec.emergency_phone ? String(rec.emergency_phone).replace(/^\+63/, "") : "",
    education_level: rec.education_level || "", school: rec.school || "", course: rec.course || "",
    year_graduated: rec.year_graduated ? String(rec.year_graduated) : "",
    work_history: Array.isArray(rec.work_history) ? rec.work_history.map((w) => ({ company: w.company || "", position: w.position || "", from: w.from || "", to: w.to || "" })) : [],
    license_restrictions: rec.license_restrictions ? String(rec.license_restrictions).split(",").filter(Boolean) : [],
    sss_no: rec.sss_no || "", tin_no: rec.tin_no || "", philhealth_no: rec.philhealth_no || "", pagibig_no: rec.pagibig_no || "",
  };
}

// Form values to the API body (blank -> null)
export function biodataPayload(f, { withGov = false } = {}) {
  const v = (x) => (x === "" || x == null ? null : x);
  const out = {
    birth_date: v(f.birth_date), sex: v(f.sex), civil_status: v(f.civil_status), nationality: v(f.nationality),
    place_of_birth: v(f.place_of_birth), personal_email: v(f.personal_email),
    emergency_name: v(f.emergency_name), emergency_relationship: v(f.emergency_relationship),
    emergency_phone: f.emergency_phone ? `+63${String(f.emergency_phone).replace(/\D/g, "").replace(/^0/, "")}` : null,
    education_level: v(f.education_level), school: v(f.school), course: v(f.course),
    year_graduated: f.year_graduated ? Number(f.year_graduated) : null,
    work_history: (f.work_history || []).filter((w) => w.company.trim()),
    license_restrictions: f.license_restrictions || [],
  };
  if (withGov) {
    for (const id of GOV_IDS) out[id.key] = v(f[id.key]);
  }
  return out;
}

// Upload one file with progress (XHR: fetch has no upload progress).
// Resolves with the server's JSON, rejects with its message.
export function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    const token = localStorage.getItem("token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.errors ? Object.values(data.errors)[0][0] : data.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(formData);
  });
}
