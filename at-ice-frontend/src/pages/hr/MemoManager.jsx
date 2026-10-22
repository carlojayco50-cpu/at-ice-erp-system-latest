import { useCallback, useEffect, useMemo, useState } from "react";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import EmptyState from "../../components/EmptyState";
import FilterSelect from "../../components/FilterSelect";
import Pagination from "../../components/Pagination";
import FileDropZone from "../../components/FileDropZone";
import { usePagination } from "../../lib/usePagination";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { ActivityFeed, StatusBreakdown, TipsWidget } from "../../components/Insight";
import { useLiveTick } from "../../lib/live";
import { formatDateShort, formatDateTime } from "../../lib/time";
import { openProtectedFile } from "../../lib/openFile";
import { fullName } from "../../lib/names";
import { toast } from "../../lib/toast";
import { MEMO_FILE_ACCEPT, MEMO_LEVEL, MEMO_STATUS } from "../../lib/memos";
import { printMemo } from "../../lib/printMemo";

// HR > Memos: disciplinary memos. Missed Time Outs at the kiosk become drafts
// on their own (App\Support\MemoEngine: 1st verbal warning, 2nd first written,
// 3rd final written, 4th Notice to Explain); HR reviews each draft and sends
// it, or cancels it with a reason. HR also issues memos by hand, including
// zero-tolerance offenses (always a Notice to Explain), with files dropped on
// the memo. Final written warnings, NTEs, zero-tolerance memos and memos to
// staff without an account are closed by uploading the wet-signed copy.

const authHeaders = (extra = {}) => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  ...extra,
});

async function call(url, { method = "GET", body, form } = {}) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(form || !body ? {} : { "Content-Type": "application/json" }),
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = data.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new Error(first || data.message || `The request failed (${res.status}).`);
  }
  return data;
}

const inputCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 outline-none focus:border-cyan-500/60 disabled:opacity-60";
const empLabel = (e) => `${e.employee_id} - ${fullName(e)}${e.position ? ` [${e.position}]` : ""}`;
const CATEGORY_LABEL = { attendance: "Attendance", conduct: "Conduct", zero_tolerance: "Zero tolerance" };

function Pill({ map, value }) {
  const s = map[value] || { label: value, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

// Issue a memo by hand: employee, violation, incident date, level, the letter
// (filled in from the violation and offense count; HR may edit it), and files.
function IssueMemoDialog({ employees, violations, levels, presetEmployee, onClose, onSaved }) {
  const [form, setForm] = useState({ employee_id: presetEmployee || "", violation: "", incident_date: new Date().toISOString().slice(0, 10), level: "", subject: "", body: "" });
  const [files, setFiles] = useState([]);
  const [hint, setHint] = useState(null);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const zero = violations.find((v) => v.key === form.violation)?.category === "zero_tolerance";

  // the suggested level and letter follow the employee, violation, date and level
  useEffect(() => {
    if (!form.employee_id || !form.violation) return undefined;
    let stop = false;
    const q = new URLSearchParams({ employee_id: form.employee_id, violation: form.violation, incident_date: form.incident_date, ...(form.level ? { level: form.level } : {}) });
    call(`/api/memos/draft-text?${q}`)
      .then((d) => {
        if (stop) return;
        setHint(d);
        setForm((f) => ({ ...f, level: f.level || d.level, ...(edited ? {} : { subject: d.subject, body: d.body }) }));
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [form.employee_id, form.violation, form.incident_date, form.level, edited]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setError("");
    if (k === "subject" || k === "body") setEdited(true);
    setForm((f) => ({ ...f, [k]: v, ...(k === "violation" || k === "employee_id" ? { level: "" } : {}) }));
    if (k === "violation" || k === "employee_id" || k === "level") setEdited(false);
  };

  const save = async (send) => {
    if (!form.employee_id || !form.violation) {
      setError("Pick the employee and the violation.");
      return;
    }
    if (form.body.trim().length < 20) {
      setError("The memo text is too short.");
      return;
    }
    setBusy(send ? "send" : "draft");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== "" && fd.append(k, v));
      fd.append("send", send ? "1" : "0");
      files.forEach((f) => fd.append("files[]", f));
      const memo = await call("/api/memos", { method: "POST", form: fd });
      toast.success(send ? `Memo ${memo.memo_no} sent to the employee.` : `Memo ${memo.memo_no} saved as a draft.`);
      onSaved(memo);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const groups = ["attendance", "conduct", "zero_tolerance"];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Issue a memo" onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div>
          <div className="text-[15px] font-semibold text-slate-800">Issue a memo</div>
          <div className="text-[11px] text-slate-500 mt-0.5">The letter is filled in from the violation and the employee's earlier offenses. Edit it as needed.</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[11px] font-medium text-slate-600">Employee</span>
            <select value={form.employee_id} onChange={set("employee_id")} className={inputCls}>
              <option value="">Choose an employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Violation</span>
            <select value={form.violation} onChange={set("violation")} className={inputCls}>
              <option value="">Choose a violation</option>
              {groups.map((g) => (
                <optgroup key={g} label={g === "zero_tolerance" ? "Zero tolerance (goes straight to a Notice to Explain)" : CATEGORY_LABEL[g]}>
                  {violations.filter((v) => v.category === g).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </optgroup>
              ))}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Incident date</span>
            <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.incident_date} onChange={set("incident_date")} className={inputCls} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[11px] font-medium text-slate-600">Level</span>
            <select value={form.level} onChange={set("level")} disabled={zero || !form.violation} className={inputCls}>
              {levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            {hint && (
              <span className="text-[11px] text-slate-500">
                {zero ? "Zero-tolerance offense: always a Notice to Explain and opens an investigation." : `This would be offense no. ${hint.offense_no} of this kind in the last 12 months.`}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[11px] font-medium text-slate-600">Subject</span>
            <input value={form.subject} maxLength={255} onChange={set("subject")} className={inputCls} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[11px] font-medium text-slate-600">Memo text</span>
            <textarea rows={9} value={form.body} maxLength={10000} onChange={set("body")} className={`${inputCls} resize-y`} /></label>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Files (optional)</span>
          <FileDropZone files={files} onChange={setFiles} accept={MEMO_FILE_ACCEPT} label="Drop a signed memo, NTE letter, CCTV stills, GPS logs or photos" hint="PDF, Word (.docx) or pictures, up to 10 MB each, 10 files" />
        </div>

        {error && <div className="text-[12px] text-red-600">{error}</div>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" data-no-confirm onClick={onClose} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="button" disabled={!!busy} onClick={() => save(false)} title="Keep it as a draft; the employee does not see it yet" className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => save(true)} title="Send the memo to the employee's account now" className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-medium cursor-pointer disabled:opacity-50">
            {busy === "send" ? "Sending…" : "Send memo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The picked memo: details, the letter (editable while a draft), files, and
// the actions its status allows.
function MemoPanel({ memo, onChanged, onClose }) {
  const [body, setBody] = useState(memo.body);
  const [subject, setSubject] = useState(memo.subject);
  const [extra, setExtra] = useState([]);
  const [signed, setSigned] = useState([]);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [mode, setMode] = useState(""); // cancel | investigation
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setBody(memo.body);
    setSubject(memo.subject);
    setExtra([]);
    setSigned([]);
    setMode("");
    setError("");
  }, [memo.id, memo.body, memo.subject]);

  const run = async (key, url, opts, done) => {
    setBusy(key);
    setError("");
    try {
      const data = await call(url, opts);
      toast.success(done);
      onChanged(data);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  const upload = (kind, list, done) => {
    if (!list.length) {
      setError("Drop or choose a file first.");
      return Promise.resolve(false);
    }
    const fd = new FormData();
    fd.append("kind", kind);
    list.forEach((f) => fd.append("files[]", f));
    return run(kind, `/api/memos/${memo.id}/files`, { method: "POST", form: fd }, done);
  };

  const emp = memo.employee || {};
  const draft = memo.status === "draft";
  const changed = body !== memo.body || subject !== memo.subject;
  const attachments = (memo.files || []).filter((f) => f.kind === "attachment");
  const signedCopies = (memo.files || []).filter((f) => f.kind === "signed_copy");

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden xl:sticky xl:top-0">
      <div className="px-5 py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-slate-800">{memo.memo_no}</span>
        <Pill map={MEMO_LEVEL} value={memo.level} />
        <Pill map={MEMO_STATUS} value={memo.status} />
        <button type="button" data-no-confirm onClick={onClose} title="Close this panel" className="ml-auto px-2 py-1 rounded-md text-[12px] text-slate-500 hover:bg-slate-50 cursor-pointer">Close panel</button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
          <div className="min-w-0 col-span-2">
            <div className="text-[11px] text-slate-400">Employee</div>
            <div className="text-slate-800 font-medium">{empLabel(emp)}</div>
            {emp.investigation_status && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-rose-50 text-rose-800 border-rose-200">Pending investigation</span>}
            {!emp.user_id && <div className="text-[11px] text-amber-700 mt-1">No system account: this memo is signed in person.</div>}
          </div>
          <div><div className="text-[11px] text-slate-400">Violation</div><div className="text-slate-800">{memo.violation_label}</div></div>
          <div><div className="text-[11px] text-slate-400">Incident date</div><div className="text-slate-800">{formatDateShort(memo.incident_date, { year: true })}{memo.offense_no ? ` · offense no. ${memo.offense_no}` : ""}</div></div>
          <div><div className="text-[11px] text-slate-400">Made by</div><div className="text-slate-800">{memo.source === "auto" ? "System (missed Time Out)" : "HR"}</div></div>
          <div><div className="text-[11px] text-slate-400">Sent</div><div className="text-slate-800">{memo.issued_at ? `${formatDateTime(memo.issued_at, { year: false })}${memo.issuer ? ` by ${memo.issuer.name}` : ""}` : "Not yet"}</div></div>
          {memo.acknowledged_at && <div className="col-span-2"><div className="text-[11px] text-slate-400">Acknowledged by the employee</div><div className="text-emerald-700">{formatDateTime(memo.acknowledged_at)}</div></div>}
          {memo.status === "cancelled" && <div className="col-span-2"><div className="text-[11px] text-slate-400">Cancelled</div><div className="text-slate-700">{memo.cancel_reason}</div></div>}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Letter</div>
          {draft ? (
            <>
              <input value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} className={inputCls} aria-label="Subject" />
              <textarea rows={10} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} className={`${inputCls} resize-y`} aria-label="Memo text" />
              {changed && (
                <button type="button" disabled={busy === "save"} onClick={() => run("save", `/api/memos/${memo.id}`, { method: "PATCH", body: { subject, body } }, "Draft saved.")} title="Save the edited letter" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                  Save changes
                </button>
              )}
            </>
          ) : (
            <>
              <div className="text-[13px] font-medium text-slate-800">{memo.subject}</div>
              <div className="rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700 whitespace-pre-wrap break-words shadow-inner max-h-72 overflow-y-auto">{memo.body}</div>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Files</div>
          {[...attachments, ...signedCopies].length === 0 ? (
            <div className="text-[12px] text-slate-400">No files yet.</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {[...attachments, ...signedCopies].map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-[12px]">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${f.kind === "signed_copy" ? "bg-cyan-50 text-cyan-800 border-cyan-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>{f.kind === "signed_copy" ? "Signed copy" : "Attachment"}</span>
                  <button type="button" data-no-confirm onClick={() => openProtectedFile(`/api/memos/${memo.id}/files/${f.id}`, f.original_name)} title="Open this file" className="min-w-0 truncate text-cyan-700 hover:underline cursor-pointer text-left">{f.original_name}</button>
                </li>
              ))}
            </ul>
          )}
          {memo.status !== "cancelled" && (
            <div className="space-y-2 pt-1">
              <FileDropZone files={extra} onChange={setExtra} accept={MEMO_FILE_ACCEPT} label="Drop evidence or letters to attach" hint="PDF, Word or pictures, up to 10 MB each" />
              {extra.length > 0 && (
                <button type="button" disabled={busy === "attachment"} onClick={async () => (await upload("attachment", extra, "Files attached.")) && setExtra([])} title="Attach these files to the memo" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                  {busy === "attachment" ? "Uploading…" : "Attach files"}
                </button>
              )}
            </div>
          )}
        </div>

        {memo.status === "awaiting_physical" && (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
            <div className="text-[12px] font-medium text-rose-800">Physical sign-off: upload the scanned wet-signed memo to archive it in the 201 file.</div>
            <FileDropZone files={signed} onChange={setSigned} accept={MEMO_FILE_ACCEPT} label="Drop the scanned signed copy" hint="PDF or a clear photo of every page" />
            <button type="button" disabled={busy === "signed_copy"} onClick={async () => (await upload("signed_copy", signed, "Signed copy uploaded. Memo archived.")) && setSigned([])} title="Upload the signed copy and archive the memo" className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer disabled:opacity-50">
              {busy === "signed_copy" ? "Uploading…" : "Upload signed copy"}
            </button>
          </div>
        )}

        {mode === "cancel" && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[12px] font-medium text-slate-700">Why is this memo cancelled? (required)</div>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The kiosk was offline that evening" className={`${inputCls} resize-y`} />
            <div className="flex gap-2">
              <button type="button" disabled={busy === "cancel"} onClick={async () => (await run("cancel", `/api/memos/${memo.id}/cancel`, { method: "POST", body: { reason } }, "Memo cancelled.")) && setReason("")} title="Cancel the memo; it no longer counts as an offense" className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50">Cancel memo</button>
              <button type="button" data-no-confirm onClick={() => setMode("")} className="px-3 py-1.5 rounded-lg text-[12px] border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer">Back</button>
            </div>
          </div>
        )}

        {mode === "investigation" && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[12px] font-medium text-slate-700">Outcome of the investigation and hearing (required)</div>
            <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Hearing held Oct 25; explanation accepted, final warning stands" className={`${inputCls} resize-y`} />
            <div className="flex gap-2">
              <button type="button" disabled={busy === "investigation"} onClick={async () => (await run("investigation", `/api/memos/${memo.id}/close-investigation`, { method: "POST", body: { outcome } }, "Investigation closed.")) && setOutcome("")} title="Record the outcome and remove Pending investigation" className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer disabled:opacity-50">Close investigation</button>
              <button type="button" data-no-confirm onClick={() => setMode("")} className="px-3 py-1.5 rounded-lg text-[12px] border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer">Back</button>
            </div>
          </div>
        )}

        {error && <div className="text-[12px] text-red-600">{error}</div>}

        <div className="flex flex-wrap gap-2 pt-3 border-t border-black/[0.06]">
          <button type="button" data-no-confirm onClick={() => printMemo(memo)} title="Print the memo letter, or save it as a PDF" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer">Print / PDF</button>
          {["draft", "sent", "awaiting_physical"].includes(memo.status) && !mode && (
            <button type="button" data-no-confirm onClick={() => setMode("cancel")} title="Cancel this memo with a reason" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-rose-700 hover:bg-rose-50 cursor-pointer">Cancel memo…</button>
          )}
          {emp.investigation_status && !mode && (memo.level === "nte" || memo.category === "zero_tolerance") && (
            <button type="button" data-no-confirm onClick={() => setMode("investigation")} title="Record the outcome of the hearing" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer">Close investigation…</button>
          )}
          {draft && (
            <button type="button" disabled={busy === "send" || changed} onClick={() => run("send", `/api/memos/${memo.id}/send`, { method: "POST" }, memo.needs_physical ? "Memo sent. The employee is told to report to HR for sign-off." : "Memo sent to the employee.")} title={changed ? "Save your changes first" : "Send this memo to the employee's account"} className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer disabled:opacity-50">
              {busy === "send" ? "Sending…" : "Send memo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MemoManager() {
  const [data, setData] = useState({ memos: [], employees: [], violations: [], levels: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("open");
  const [employee, setEmployee] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await call("/api/memos"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a memo notice arrives (lib/live.js)
  const live = useLiveTick(["memos", "attendance"]);
  useEffect(() => {
    load();
  }, [load, live]);

  // leaving the page clears the picked memo and filters
  useEffect(() => () => setSelected(null), []);

  const { memos, employees, violations, levels } = data;
  const counts = useMemo(() => {
    const c = { draft: 0, sent: 0, awaiting_physical: 0, acknowledged: 0, archived: 0, cancelled: 0 };
    memos.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
    return c;
  }, [memos]);
  const investigations = employees.filter((e) => e.investigation_status);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memos
      .filter((m) => {
        if (status === "open") return ["draft", "sent", "awaiting_physical"].includes(m.status);
        return status === "all" || m.status === status;
      })
      .filter((m) => employee === "all" || m.employee_id === employee)
      .filter((m) => category === "all" || m.category === category)
      .filter((m) => !q || [m.memo_no, m.employee?.employee_id, fullName(m.employee || {}), m.violation_label].some((v) => (v || "").toLowerCase().includes(q)));
  }, [memos, status, employee, category, search]);

  const pager = usePagination(rows);
  const current = memos.find((m) => m.id === selected);

  const byViolation = useMemo(() => {
    const map = new Map();
    memos.filter((m) => m.status !== "cancelled").forEach((m) => map.set(m.violation_label, (map.get(m.violation_label) || 0) + 1));
    const tones = ["amber", "rose", "cyan", "violet", "slate", "emerald"];
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count], i) => ({ label, count, tone: tones[i % tones.length] }));
  }, [memos]);

  const replace = (memo) => {
    setData((d) => ({ ...d, memos: d.memos.some((m) => m.id === memo.id) ? d.memos.map((m) => (m.id === memo.id ? memo : m)) : [memo, ...d.memos] }));
    load();
  };

  const STATUS_OPTIONS = [
    { value: "open", label: "Needs action", count: counts.draft + counts.sent + counts.awaiting_physical },
    { value: "draft", label: "Drafts to review", count: counts.draft },
    { value: "sent", label: "Awaiting acknowledgment", count: counts.sent },
    { value: "awaiting_physical", label: "Awaiting physical sign-off", count: counts.awaiting_physical },
    { value: "acknowledged", label: "Acknowledged", count: counts.acknowledged },
    { value: "archived", label: "Signed and archived", count: counts.archived },
    { value: "cancelled", label: "Cancelled", count: counts.cancelled },
    { value: "all", label: "All", count: memos.length },
  ];

  return (
    <HrLayout
      pageTitle="Memos"
      breadcrumb="HRIS / Memos"
      headerActions={
        <button type="button" data-no-confirm onClick={() => setIssuing(true)} title="Issue a memo to an employee" className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer">
          Issue memo
        </button>
      }
    >
      <KpiGrid cols={4}>
        <KpiCard label="Drafts to review" icon="file" tone="amber" value={counts.draft} sub="Made from missed Time Outs and saved drafts" onClick={() => setStatus("draft")} active={status === "draft"} live={counts.draft > 0} />
        <KpiCard label="Awaiting acknowledgment" icon="clock" tone="cyan" value={counts.sent} sub="Sent to the employee's account" onClick={() => setStatus("sent")} active={status === "sent"} />
        <KpiCard label="Awaiting sign-off" icon="alert" tone="rose" value={counts.awaiting_physical} sub="Employee must sign at the HR office" onClick={() => setStatus("awaiting_physical")} active={status === "awaiting_physical"} live={counts.awaiting_physical > 0} />
        <KpiCard label="Pending investigation" icon="shield" tone="violet" value={investigations.length} sub={investigations.length ? investigations.map((e) => e.employee_id).slice(0, 3).join(", ") : "No open investigations"} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 min-w-0 bg-white border border-black/[0.09] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <div className="text-[13px] font-semibold text-slate-800">Disciplinary memos</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Missed Time Outs become drafts here. Nothing reaches an employee until HR sends it.</div>
            </div>
            <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <FilterSelect label="Type" value={category} onChange={setCategory} options={[{ value: "all", label: "All", count: memos.length }, ...Object.entries(CATEGORY_LABEL).map(([k, l]) => ({ value: k, label: l, count: memos.filter((m) => m.category === k).length }))]} />
          </div>
          <div className="px-5 py-3 border-b border-black/[0.06] flex flex-wrap items-center gap-3">
            <FilterSelect label="Employee" value={employee} onChange={setEmployee} className="min-w-0 flex-1" options={[{ value: "all", label: "All employees", count: memos.filter((m) => m.status !== "cancelled").length }, ...employees.map((e) => ({ value: e.id, label: empLabel(e), count: memos.filter((m) => m.employee_id === e.id && m.status !== "cancelled").length }))]} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memo no., employee or violation" className="w-full sm:w-64 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60" />
          </div>

          {error && <div className="px-5 py-3 text-[12px] text-red-600 bg-red-50 border-b border-red-200">{error}</div>}

          {loading ? (
            <SkeletonList />
          ) : rows.length === 0 ? (
            <EmptyState icon="file" title={status === "open" ? "Nothing needs action" : "No memos here"}>
              {status === "open" ? "Drafts from missed Time Outs and memos waiting on employees show up here." : "Pick another status, type or employee."}
            </EmptyState>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
                      <th className="px-4 py-3 font-medium">Memo no.</th>
                      <th className="px-4 py-3 font-medium">Employee</th>
                      <th className="px-4 py-3 font-medium">Violation</th>
                      <th className="px-4 py-3 font-medium">Level</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Incident</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.pageItems.map((m) => (
                      <tr
                        key={m.id}
                        tabIndex={0}
                        aria-selected={selected === m.id}
                        onClick={() => setSelected(m.id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(m.id))}
                        className={`border-t border-black/[0.06] align-middle cursor-pointer hover:bg-slate-50 ${selected === m.id ? "bg-cyan-50/60" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-700 whitespace-nowrap">{m.memo_no}</td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <div className="text-slate-800 truncate">{fullName(m.employee || {})}</div>
                          <div className="text-[11px] text-slate-400">{m.employee?.employee_id}{m.employee?.investigation_status ? " · Pending investigation" : ""}</div>
                        </td>
                        <td className="px-4 py-3 min-w-[180px] max-w-[260px]">
                          <div className="text-slate-700 truncate">{m.violation_label}</div>
                          <div className="text-[11px] text-slate-400">{m.source === "auto" ? "From missed Time Out" : CATEGORY_LABEL[m.category]}{m.offense_no ? ` · no. ${m.offense_no}` : ""}</div>
                        </td>
                        <td className="px-4 py-3"><Pill map={MEMO_LEVEL} value={m.level} /></td>
                        <td className="px-4 py-3"><Pill map={MEMO_STATUS} value={m.status} /></td>
                        <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">{formatDateShort(m.incident_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pager={pager} label="memos" />
            </>
          )}
        </div>

        <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0">
          {current ? (
            <MemoPanel memo={current} onChanged={replace} onClose={() => setSelected(null)} />
          ) : (
            <>
              <StatusBreakdown title="Memos by violation" items={byViolation} empty="No memos yet." />
              <ActivityFeed
                title="Latest memos"
                items={memos.map((m) => ({
                  id: m.id,
                  title: `${m.memo_no} · ${fullName(m.employee || {})}`,
                  meta: `${MEMO_LEVEL[m.level]?.label || m.level} · ${MEMO_STATUS[m.status]?.label || m.status}`,
                  when: formatDateTime(m.created_at, { year: false }),
                  tone: m.status === "draft" ? "amber" : m.status === "awaiting_physical" ? "rose" : "emerald",
                  icon: "file",
                }))}
                empty="Memos will be listed here."
              />
              <TipsWidget tips={[
                { title: "Review every draft", text: "Check the attendance before sending. Cancel a draft with a reason if the kiosk was down or the employee was on an approved errand; a cancelled memo does not count.", tone: "amber", icon: "alert" },
                { title: "Due process", text: "A Notice to Explain gives the employee five calendar days to answer in writing and a hearing before any decision.", tone: "cyan", icon: "shield" },
              ]} />
            </>
          )}
        </aside>
      </div>

      {issuing && (
        <IssueMemoDialog
          employees={employees}
          violations={violations}
          levels={levels}
          presetEmployee={employee !== "all" ? employee : ""}
          onClose={() => setIssuing(false)}
          onSaved={(memo) => { setIssuing(false); replace(memo); setSelected(memo.id); }}
        />
      )}
    </HrLayout>
  );
}
