import { PRINT_BASE_CSS, printDocument } from "./printDocument";
import { CIVIL_STATUSES, EDUCATION_LEVELS, GOV_IDS, RESTRICTIONS, SEXES, labelOf } from "./biodata";
import { fullName, shiftLabel } from "./names";
import { COMPANY } from "./company";

// The employee's biodata as a printable hard copy, made from the saved record
// (HR > Employees, Biodata; owner 2026-10-20). Same print base as the
// payslip and invoice, so it fits any paper. The photo is the 2x2 photo
// document, else the enrolled Face ID picture.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const date = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "");
const month = (v) => (v ? new Date(`${v}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" }) : "");
const age = (v) => {
  if (!v) return "";
  const b = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  const t = new Date();
  return String(t.getFullYear() - b.getFullYear() - (t < new Date(t.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0));
};

async function asDataUrl(url, auth) {
  try {
    const res = await fetch(url, auth ? { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } } : undefined);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function printBiodata(emp, documents = []) {
  const photoDoc = documents.find((d) => d.type === "photo");
  const photo = photoDoc
    ? await asDataUrl(`/api/employees/${emp.id}/documents/${photoDoc.id}`, true)
    : emp.face_data?.photo_path ? await asDataUrl(`${BACKEND_URL}/storage/${emp.face_data.photo_path}`, false) : null;

  const row = (label, value) => `<tr><th>${esc(label)}</th><td>${esc(value) || "&nbsp;"}</td></tr>`;
  const section = (title, rows) => `<h2>${esc(title)}</h2><table class="kv">${rows.join("")}</table>`;
  const address = [emp.block_lot, emp.street, emp.subdivision, emp.barangay, emp.city, emp.province].filter(Boolean).join(", ") || emp.address || "";
  const isDriver = emp.user?.role === "driver";
  const work = Array.isArray(emp.work_history) ? emp.work_history : [];
  const restrictions = String(emp.license_restrictions || "").split(",").filter(Boolean)
    .map((c) => `${c} (${labelOf(RESTRICTIONS, c)})`).join(", ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Biodata ${esc(emp.employee_id)}</title><style>${PRINT_BASE_CSS}
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0e7490; padding-bottom: 8px; }
    .head h1 { margin: 0; font-size: 18px; letter-spacing: 2px; }
    .head .co { font-size: 11px; color: #374151; }
    .who { display: flex; gap: 14px; align-items: flex-start; margin-top: 12px; }
    .photo { width: 2in; height: 2in; flex-shrink: 0; border: 1px solid #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #6b7280; overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .who .name { font-size: 17px; font-weight: 700; }
    .who .meta { margin-top: 4px; color: #374151; line-height: 1.6; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; background: #ecfeff; color: #155e75; padding: 4px 6px; margin: 14px 0 4px; }
    table.kv th { width: 34%; text-align: left; font-weight: 600; color: #374151; padding: 3px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    table.kv td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
    table.list th, table.list td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: left; }
    table.list th { background: #f3f4f6; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
    .sign div { border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 11px; }
    .foot { margin-top: 18px; font-size: 9.5px; color: #6b7280; }
  </style></head><body><div class="sheet">
    <div class="head">
      <div><h1>EMPLOYEE BIODATA</h1><div class="co">${esc(COMPANY?.name || "Bella Erin Tube Ice Inc.")}</div></div>
      <div class="title" style="text-align:right"><div><b>${esc(emp.employee_id)}</b></div><div class="co">Printed ${esc(date(new Date().toISOString()))}</div></div>
    </div>
    <div class="who">
      <div class="photo">${photo ? `<img src="${photo}" alt="">` : "2x2 photo"}</div>
      <div>
        <div class="name">${esc(fullName(emp))}</div>
        <div class="meta">${esc(emp.position || "")}${emp.department ? ` · ${esc(emp.department)}` : ""}<br>
          Hired ${esc(date(emp.date_hired))} · ${esc(emp.employment_status === "regular" ? "Regular" : "Probationary")}<br>
          Shift ${esc(shiftLabel(emp))}${emp.user?.email ? `<br>Login ${esc(emp.user.email)}` : ""}</div>
      </div>
    </div>
    ${section("Personal information", [
      row("Date of birth", emp.birth_date ? `${date(emp.birth_date)} (age ${age(emp.birth_date)})` : ""),
      row("Place of birth", emp.place_of_birth), row("Sex", labelOf(SEXES, emp.sex)),
      row("Civil status", labelOf(CIVIL_STATUSES, emp.civil_status)), row("Nationality", emp.nationality),
    ])}
    ${section("Contact", [
      row("Mobile number", emp.phone), row("Personal email", emp.personal_email), row("Address", address),
      row("Emergency contact", [emp.emergency_name, emp.emergency_relationship && `(${emp.emergency_relationship})`, emp.emergency_phone].filter(Boolean).join(" ")),
    ])}
    ${section("Government numbers", GOV_IDS.map((g) => row(g.label, emp[g.key])))}
    ${section("Employment", [
      row("Employment type", { regular: "Regular", contractual: "Contractual", part_time: "Part-time" }[emp.employment_type] || emp.employment_type),
      row("Pay basis", emp.pay_basis === "monthly" ? "Monthly" : "Daily"),
      ...(isDriver ? [
        row("Driver's license no.", emp.license_number), row("License expiry", date(emp.license_expiry)),
        row("Restriction codes", restrictions), row("Vehicle plate", emp.vehicle_plate),
      ] : []),
    ])}
    ${section("Education", [
      row("Highest attainment", labelOf(EDUCATION_LEVELS, emp.education_level)), row("School", emp.school),
      row("Course", emp.course), row("Year graduated", emp.year_graduated),
    ])}
    <h2>Work history</h2>
    ${work.length ? `<table class="list"><thead><tr><th>Company</th><th>Position</th><th>From</th><th>To</th></tr></thead><tbody>
      ${work.map((w) => `<tr><td>${esc(w.company)}</td><td>${esc(w.position)}</td><td>${esc(month(w.from))}</td><td>${esc(w.to ? month(w.to) : "Present")}</td></tr>`).join("")}
    </tbody></table>` : `<div style="padding:3px 6px;color:#6b7280">None given.</div>`}
    <div class="sign"><div>Employee signature over printed name</div><div>HR officer</div></div>
    <div class="foot">Confidential. Personal data is processed under the Data Privacy Act of 2012 (RA 10173) for employment purposes only.</div>
  </div></body></html>`;

  printDocument(html);
}
