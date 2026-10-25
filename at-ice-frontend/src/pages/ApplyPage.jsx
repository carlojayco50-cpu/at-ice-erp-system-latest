import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import PhoneInput from "../components/PhoneInput";
import AddressFields from "../components/AddressFields";
import { MOBILE_REGEX, MOBILE_MESSAGE, toStoredPhone } from "../lib/phone";
import { PUBLIC_POSITIONS } from "../lib/positions";
import { useDraft } from "../lib/useDraft";
import DraftHint from "../components/DraftHint";
import { CIVIL_STATUSES, EDUCATION_LEVELS, RESTRICTIONS, SEXES } from "../lib/biodata";
import { formatLicense, licenseError, expiryError, tomorrowStr } from "../lib/license";

// Public job application / digital biodata (owner, 2026-10-20), opened by
// scanning the hiring QR code HR prints from HRIS > Interviews. Mobile first:
// one column, large fields and buttons. No login. The applicant first agrees
// to the Data Privacy Act consent; only then can the form be filled in. Then:
//   1 Personal   2 Contact and emergency contact   3 Driver's license (Driver
//   applicants only)   4 Education and work   5 Photo and documents
// Government numbers are not asked here (HR adds them once hired). Sends
// POST /api/apply; the application lands as Pending in HRIS > Interviews and
// everything carries over to Add Employee when HR hires the applicant.

const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const RESUME_MAX = 5 * 1024 * 1024;
const FILE_MAX = 10 * 1024 * 1024;
const isResumeFile = (file) => /\.(pdf|docx?)$/i.test(file.name);

const labelCls = "text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase";
const fieldCls = "neu-inset w-full min-h-[48px] rounded-xl px-4 py-2.5 bg-transparent text-[16px] text-slate-800 placeholder:text-[var(--neu-faint)] outline-none disabled:opacity-60";
const primaryBtn =
  "mt-1 w-full min-h-[52px] py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[16px] font-semibold rounded-xl transition-[background-color,box-shadow] duration-150 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[5px_5px_12px_var(--neu-lo),-5px_-5px_12px_var(--neu-hi)]";

const EMPTY = {
  name: "", phone: "", email: "", position_applied: "", notes: "", website: "",
  block_lot: "", street: "", subdivision: "", barangay: "", barangay_code: "",
  city: "", province: "", region: "", postal_code: "",
  birth_date: "", sex: "", civil_status: "", nationality: "Filipino", place_of_birth: "",
  emergency_name: "", emergency_relationship: "", emergency_phone: "",
  license_number: "", license_expiry: "", license_restrictions: [],
  education_level: "", school: "", course: "", year_graduated: "", work_history: [],
};

function Section({ n, title, sub, children }) {
  return (
    <section className="flex flex-col gap-4 pt-2" aria-labelledby={`apply-s${n}`}>
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 flex-shrink-0 rounded-full bg-cyan-600 text-white grid place-items-center text-[14px] font-bold">{n}</span>
        <div>
          <h2 id={`apply-s${n}`} className="text-[16px] font-bold text-slate-800 leading-tight">{title}</h2>
          {sub && <p className="text-[12px] text-[var(--neu-muted)]">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function FilePick({ label, hint, accept, capture, multiple = false, files, onPick, onRemove, error }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={labelCls}>{label}</span>
      <label className={`flex items-center gap-3 px-4 py-4 min-h-[64px] rounded-xl border-2 border-dashed cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-cyan-500/40 ${files.length ? "border-cyan-500/60 bg-cyan-50/40" : "border-[var(--neu-faint)]/50 hover:border-cyan-500/60"}`}>
        <input type="file" accept={accept} capture={capture} multiple={multiple} className="sr-only"
          onChange={(e) => { const list = [...(e.target.files || [])]; e.target.value = ""; if (list.length) onPick(list); }} />
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true" className="text-cyan-600 flex-shrink-0">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
        </svg>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium text-slate-700">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached · tap to add` : "Take a photo or choose a file"}</span>
          <span className="block text-[12px] text-[var(--neu-muted)]">{hint}</span>
        </span>
      </label>
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-[13px] px-1">
          <span className="truncate text-slate-700">{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" onClick={() => onRemove(i)} className="text-[13px] font-medium text-red-600 hover:underline cursor-pointer flex-shrink-0">Remove</button>
        </div>
      ))}
      {error && <span className="text-[12px] text-red-600">{error}</span>}
    </div>
  );
}

export default function ApplyPage() {
  // Opened from an employee's referral link: /job-applications/EMP-0001
  const { referrer = "" } = useParams();
  // What was typed survives a refresh (files have to be attached again).
  const draft = useDraft("apply", { form: EMPTY, consent: false });
  const { form, consent } = draft.values;
  const setForm = draft.set.form;
  const setConsent = draft.set.consent;
  const [showNotice, setShowNotice] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [resume, setResume] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [documents, setDocuments] = useState([]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm]);
  const isDriver = form.position_applied === "Driver";
  const work = form.work_history || [];
  const setWork = (i, k) => (e) => setForm((f) => ({ ...f, work_history: (f.work_history || []).map((w, j) => (j === i ? { ...w, [k]: e.target.value } : w)) }));

  const resetFiles = () => { setResume(null); setPhoto(null); setDocuments([]); };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const errs = {};
    if (!consent) errs.consent = ["Agree to the data privacy consent to send your application."];
    if (form.name.trim().length < 3) errs.name = ["Enter your full name."];
    if (!MOBILE_REGEX.test(form.phone)) errs.phone = [form.phone ? MOBILE_MESSAGE : "Enter your mobile number so HR can contact you."];
    if (form.emergency_phone && !MOBILE_REGEX.test(form.emergency_phone)) errs.emergency_phone = [MOBILE_MESSAGE];
    if (!form.position_applied) errs.position_applied = ["Choose the position you are applying for."];
    if (isDriver && licenseError(form.license_number)) errs.license_number = [licenseError(form.license_number)];
    if (isDriver && expiryError(form.license_expiry)) errs.license_expiry = [expiryError(form.license_expiry)];
    if (resume && resume.size > RESUME_MAX) errs.resume = ["The resume is too large. Use a file up to 5 MB."];
    if ([photo, ...documents].some((f) => f && f.size > FILE_MAX)) errs.documents = ["Each file must be up to 10 MB."];
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector("[data-apply-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      const plain = { ...form, phone: toStoredPhone(form.phone), emergency_phone: form.emergency_phone ? toStoredPhone(form.emergency_phone) : "" };
      delete plain.work_history;
      delete plain.license_restrictions;
      if (!isDriver) { plain.license_number = ""; plain.license_expiry = ""; }
      for (const [k, v] of Object.entries(plain)) {
        const value = String(v ?? "").trim();
        if (value) body.append(k, value);
      }
      body.append("consent", "1");
      work.filter((w) => w.company.trim()).forEach((w, i) => {
        for (const k of ["company", "position", "from", "to"]) if (w[k]) body.append(`work_history[${i}][${k}]`, w[k]);
      });
      if (isDriver) (form.license_restrictions || []).forEach((c) => body.append("license_restrictions[]", c));
      if (referrer) body.append("referral", referrer);
      if (resume) body.append("resume", resume);
      if (photo) body.append("photo", photo);
      documents.forEach((d) => body.append("documents[]", d));

      const res = await fetch("/api/apply", { method: "POST", headers: { Accept: "application/json" }, body });
      const data = await res.json().catch(() => null);
      if (res.status === 422 && data?.errors) {
        setErrors(data.errors);
        setTimeout(() => document.querySelector("[data-apply-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        return;
      }
      if (res.status === 413) throw new Error("The files are too large. Use smaller files and try again.");
      if (res.status === 429) throw new Error("Too many applications were sent from this network. Wait a few minutes and try again.");
      if (!res.ok) throw new Error(data?.message || "The application could not be sent. Try again.");
      setSent({ name: form.name, phone: form.phone, position_applied: form.position_applied });
      draft.clear();
      resetFiles();
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const err = (k) => {
    const list = errors[k] || Object.entries(errors).find(([key]) => key.startsWith(`${k}.`))?.[1];
    return list && <span data-apply-error className="text-[12px] text-red-600">{list[0]}</span>;
  };

  return (
    <div className="relative w-full min-h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-lg px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none mt-3">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">AT-ICE · We're hiring</div>
        </div>

        <div className="neu rounded-[28px] shadow-2xl shadow-black/40 bg-[var(--neu-bg)] px-5 sm:px-8 py-7 flex flex-col gap-4">
          {sent ? (
            <div className="text-center flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h1 className="text-[22px] font-bold text-[var(--neu-accent)]">Application sent</h1>
              <p className="text-[14px] text-[var(--neu-muted)] max-w-xs">
                Thank you, {sent.name.trim().split(/\s+/)[0]}! Your application for <b className="text-slate-700">{sent.position_applied}</b> is now pending review. HR will contact you at +63 {sent.phone} to set your interview.
              </p>
              <button type="button" onClick={() => { draft.clear(); resetFiles(); setSent(null); setErrors({}); }} className="text-[13px] font-medium text-[var(--neu-accent)] hover:underline cursor-pointer mt-1">
                Send another application
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="text-center mb-1">
                <h1 className="text-[22px] font-bold text-[var(--neu-accent)] tracking-wide">Job application</h1>
                <p className="text-[13px] text-[var(--neu-muted)] mt-1">Your digital biodata. HR will contact you to set an interview.</p>
              </div>
              <DraftHint draft={draft} onDiscard={() => { resetFiles(); setErrors({}); }} />

              {/* Data Privacy Act of 2012: nothing can be typed before consent */}
              <div className={`rounded-2xl p-4 flex flex-col gap-3 ${consent ? "bg-emerald-50 border border-emerald-200" : "neu-inset"}`}>
                <div className="text-[14px] font-semibold text-slate-800">Data privacy consent</div>
                <p className="text-[13px] text-[var(--neu-muted)] leading-relaxed">
                  Bella Erin Tube Ice Inc. collects your personal data only to review your application for employment, under the Data Privacy Act of 2012 (RA 10173).
                  {" "}<button type="button" onClick={() => setShowNotice((v) => !v)} aria-expanded={showNotice} className="font-semibold text-[var(--neu-accent)] underline cursor-pointer">
                    {showNotice ? "Hide the privacy notice" : "Read the privacy notice"}
                  </button>
                </p>
                {showNotice && (
                  <ul className="text-[12.5px] text-slate-600 list-disc pl-5 space-y-1">
                    <li>What we collect: what you type below and the files you attach.</li>
                    <li>Why: to screen and contact you for this job. If hired, it becomes part of your employee record.</li>
                    <li>Who sees it: Bella Erin HR only. It is never sold or shared outside the company.</li>
                    <li>How long: until HR decides; records of applicants not hired are reviewed and deleted.</li>
                    <li>Your rights: ask HR to see, correct or delete your data at any time.</li>
                  </ul>
                )}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" style={{ width: 22, height: 22 }} />
                  <span className="text-[14px] font-medium text-slate-800">I agree and consent to Bella Erin ERP processing my personal data for employment purposes.</span>
                </label>
                {err("consent")}
              </div>

              <fieldset disabled={!consent} className="flex flex-col gap-4 min-w-0 disabled:opacity-50">
                <Section n={1} title="Personal information">
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Full Name *</span>
                    <input value={form.name} onChange={set("name")} autoComplete="name" maxLength={255} placeholder="Juan Dela Cruz" className={fieldCls} />
                    {err("name")}
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Position *</span>
                    <select value={form.position_applied} onChange={set("position_applied")} className={fieldCls}>
                      <option value="">Choose a position</option>
                      {PUBLIC_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {err("position_applied")}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>Date of Birth</span>
                      <input type="date" value={form.birth_date} onChange={set("birth_date")} className={fieldCls} />
                      {err("birth_date")}
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>Sex</span>
                      <select value={form.sex} onChange={set("sex")} className={fieldCls}>
                        <option value="">Choose</option>
                        {SEXES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>Civil Status</span>
                      <select value={form.civil_status} onChange={set("civil_status")} className={fieldCls}>
                        <option value="">Choose</option>
                        {CIVIL_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>Nationality</span>
                      <input value={form.nationality} onChange={set("nationality")} maxLength={50} className={fieldCls} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Place of Birth</span>
                    <input value={form.place_of_birth} onChange={set("place_of_birth")} maxLength={120} placeholder="City or municipality, province" className={fieldCls} />
                  </label>
                </Section>

                <Section n={2} title="Contact" sub="So HR can reach you">
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Mobile Number *</span>
                    <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} className={fieldCls} invalid={!!form.phone && !MOBILE_REGEX.test(form.phone)} />
                    {err("phone")}
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Email (optional)</span>
                    <input type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} maxLength={255} placeholder="name@example.com" className={fieldCls} />
                    {err("email")}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`sm:col-span-2 ${labelCls}`}>Home Address</div>
                    <AddressFields value={form} onChange={handleAddress} errors={errors} inputClassName={fieldCls} labelClassName="text-[12px] text-[var(--neu-muted)]" />
                  </div>
                  <div className={labelCls}>In case of emergency</div>
                  <input value={form.emergency_name} onChange={set("emergency_name")} maxLength={120} placeholder="Name" aria-label="Emergency contact name" className={fieldCls} />
                  <input value={form.emergency_relationship} onChange={set("emergency_relationship")} maxLength={40} placeholder="Relationship (e.g. Mother)" aria-label="Emergency contact relationship" className={fieldCls} />
                  <PhoneInput value={form.emergency_phone} onChange={(emergency_phone) => setForm((f) => ({ ...f, emergency_phone }))} className={fieldCls}
                    invalid={!!form.emergency_phone && !MOBILE_REGEX.test(form.emergency_phone)} />
                  {err("emergency_phone")}
                </Section>

                {isDriver && (
                  <Section n={3} title="Driver's license" sub="Needed to screen Driver applicants">
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>License Number *</span>
                      <input value={form.license_number} onChange={(e) => setForm((f) => ({ ...f, license_number: formatLicense(e.target.value) }))}
                        placeholder="N01-23-456789" maxLength={13} autoCapitalize="characters" className={`${fieldCls} font-mono`} />
                      {err("license_number")}
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={labelCls}>Expiry Date *</span>
                      <input type="date" min={tomorrowStr()} value={form.license_expiry} onChange={set("license_expiry")} className={fieldCls} />
                      {err("license_expiry")}
                    </label>
                    <div className="flex flex-col gap-2">
                      <span className={labelCls}>Restriction Codes</span>
                      <div className="grid grid-cols-1 gap-2">
                        {RESTRICTIONS.filter(([c]) => !/^\d$/.test(c)).map(([code, label]) => (
                          <label key={code} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                            <input type="checkbox" checked={(form.license_restrictions || []).includes(code)} style={{ width: 22, height: 22 }}
                              onChange={(e) => setForm((f) => ({ ...f, license_restrictions: e.target.checked ? [...(f.license_restrictions || []), code] : (f.license_restrictions || []).filter((c) => c !== code) }))} />
                            <span className="text-[14px] text-slate-700"><b className="font-mono">{code}</b> · {label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </Section>
                )}

                <Section n={isDriver ? 4 : 3} title="Education and work">
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Highest Attainment</span>
                    <select value={form.education_level} onChange={set("education_level")} className={fieldCls}>
                      <option value="">Choose</option>
                      {EDUCATION_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <input value={form.school} onChange={set("school")} maxLength={160} placeholder="School" aria-label="School" className={fieldCls} />
                  <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                    <input value={form.course} onChange={set("course")} maxLength={160} placeholder="Course or strand" aria-label="Course or strand" className={fieldCls} />
                    <input type="number" inputMode="numeric" value={form.year_graduated} onChange={set("year_graduated")} placeholder="Year" aria-label="Year graduated" className={fieldCls} />
                  </div>
                  {err("year_graduated")}
                  <div className={labelCls}>Work experience</div>
                  {work.map((w, i) => (
                    <div key={i} className="neu-inset rounded-2xl p-3 flex flex-col gap-3">
                      <input value={w.company} onChange={setWork(i, "company")} placeholder="Company" aria-label="Company" className={fieldCls} />
                      <input value={w.position} onChange={setWork(i, "position")} placeholder="Position" aria-label="Position" className={fieldCls} />
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                        <input type="month" value={w.from} onChange={setWork(i, "from")} aria-label="From" className={fieldCls} />
                        <input type="month" value={w.to} onChange={setWork(i, "to")} aria-label="To (blank: present)" className={fieldCls} />
                      </div>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, work_history: (f.work_history || []).filter((_, j) => j !== i) }))}
                        className="self-end min-h-[44px] text-[13px] font-medium text-red-600 hover:underline cursor-pointer">Remove</button>
                    </div>
                  ))}
                  {err("work_history")}
                  {work.length < 5 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, work_history: [...(f.work_history || []), { company: "", position: "", from: "", to: "" }] }))}
                      className="min-h-[48px] rounded-xl border-2 border-dashed border-[var(--neu-faint)]/50 text-[14px] font-medium text-[var(--neu-accent)] cursor-pointer">
                      + Add work experience
                    </button>
                  )}
                  <label className="flex flex-col gap-2">
                    <span className={labelCls}>Message to HR (optional)</span>
                    <textarea value={form.notes} onChange={set("notes")} rows={3} maxLength={1000} placeholder="e.g. when you can start" className={`${fieldCls} resize-none`} />
                  </label>
                </Section>

                <Section n={isDriver ? 5 : 4} title="Photo and documents" sub="Your phone camera or gallery opens">
                  <FilePick label="2x2 photo" hint="A clear photo of your face · JPG or PNG" accept="image/*" capture="user"
                    files={photo ? [photo] : []} onPick={(list) => setPhoto(list[0])} onRemove={() => setPhoto(null)} error={errors.photo?.[0]} />
                  <FilePick label="Resume / CV" hint="PDF or Word · up to 5 MB" accept={RESUME_ACCEPT}
                    files={resume ? [resume] : []}
                    onPick={(list) => {
                      if (!isResumeFile(list[0])) { setErrors((p) => ({ ...p, resume: ["Attach your resume as a PDF or a Word file (DOC, DOCX)."] })); return; }
                      setErrors((p) => ({ ...p, resume: undefined }));
                      setResume(list[0]);
                    }}
                    onRemove={() => setResume(null)} error={errors.resume?.[0]} />
                  <FilePick label="Other documents (optional)" hint="IDs, certificates, NBI clearance · PDF or photo, up to 4" accept="image/*,application/pdf" multiple
                    files={documents} onPick={(list) => setDocuments((d) => [...d, ...list].slice(0, 4))} onRemove={(i) => setDocuments((d) => d.filter((_, j) => j !== i))}
                    error={(errors.documents || Object.entries(errors).find(([k]) => k.startsWith("documents."))?.[1])?.[0]} />
                </Section>
              </fieldset>

              {/* Left empty by people; bots fill it (spam guard) */}
              <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              {error && <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">{error}</div>}
              <button type="submit" disabled={busy || !consent} className={primaryBtn}>{busy ? "Sending…" : "Send Application"}</button>
              <p className="text-[11px] text-[var(--neu-faint)] text-center">Your details are used only by Bella Erin HR for this application.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
