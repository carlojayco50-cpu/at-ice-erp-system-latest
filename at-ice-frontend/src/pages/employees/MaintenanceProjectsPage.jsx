import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { StatusBadge, LoadingButton, BottomSheet, ActionBar, ErrorBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, FIELD, TEXTAREA, LABEL } from "../../lib/mobileUi";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";

const STATUS = { planned: "Planned", working: "Working on it", stuck: "Stuck", done: "Done" };
const EMPTY = { name: "", description: "", location: "" };

// Maintenance > Projects: add a maintenance or plant job (what and where).
// Admin then sets the owner, budget, dates, status and priority on Admin >
// Projects. ?new=1 opens the form.
export default function MaintenanceProjectsPage() {
  const token = localStorage.getItem("token");
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setShowForm(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/my-projects", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Could not load your projects.");
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
      setStatus("ready");
    } catch (err) {
      setLoadError(err.message);
      setStatus("error");
    }
  }, [token]);
  const live = useLiveTick(["projects"]);
  useEffect(() => { load(); }, [load, live]);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const local = {};
    if (!form.name.trim()) local.name = ["Enter the project name."];
    if (!form.description.trim()) local.description = ["Describe the job."];
    if (!form.location.trim()) local.location = ["Enter where the job is."];
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    try {
      const res = await fetch("/api/my-projects", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim(), location: form.location.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors || { _general: [data.message || "Could not add the project."] });
        return;
      }
      toast.success("Project was added. Admin will set the owner, budget and dates.");
      setForm(EMPTY);
      setErrors({});
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, placeholder, multiline = false) => (
    <div>
      <label htmlFor={`project-${key}`} className={LABEL}>{label} *</label>
      {multiline ? (
        <textarea id={`project-${key}`} rows={3} value={form[key]} placeholder={placeholder}
          onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setErrors({}); }} className={TEXTAREA} />
      ) : (
        <input id={`project-${key}`} value={form[key]} placeholder={placeholder}
          onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setErrors({}); }} className={FIELD} />
      )}
      {errors[key] && <p className="text-[13px] text-rose-700 mt-1.5">{errors[key][0]}</p>}
    </div>
  );

  // stuck and overdue first, done last
  const order = { stuck: 0, working: 1, planned: 2, done: 3 };
  const sorted = [...projects].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return (
    <RoleShell
      role="maintenance"
      title="Projects"
      actionBar={<ActionBar><LoadingButton onClick={() => setShowForm(true)}><Icon name="plus" /> Log a repair job</LoadingButton></ActionBar>}
    >
      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>}
      {status === "ready" && sorted.length === 0 && (
        <EmptyCard icon="clipboard" title="No projects yet">Tap Log a repair job to add a job for Admin to schedule.</EmptyCard>
      )}

      {status === "ready" && (
        <div className="grid grid-cols-1 gap-3">
          {sorted.map((p) => (
            <article key={p.id} className={`${CARD} ${p.status === "stuck" || p.overdue ? "border-rose-200" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-slate-900">{p.name}</h2>
                <StatusBadge tone={p.overdue && p.status !== "done" ? "urgent" : undefined} status={p.status}>
                  {p.overdue && p.status !== "done" ? "Overdue" : STATUS[p.status] || p.status}
                </StatusBadge>
              </div>
              {p.description && <p className="text-[14px] text-slate-600 mt-1">{p.description}</p>}
              {p.location && <p className="text-[13px] text-slate-500 mt-1 flex items-start gap-1"><Icon name="pin" size={14} className="mt-0.5 flex-shrink-0" />{p.location}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div><dt className="text-slate-400">Owner</dt><dd className="text-slate-700">{p.owner || "Not set yet"}</dd></div>
                <div><dt className="text-slate-400">Due</dt><dd className="text-slate-700">{p.due_date ? new Date(`${p.due_date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Not set yet"}</dd></div>
                <div className="col-span-2"><dt className="text-slate-400">Parts requests</dt><dd className="text-slate-700">{p.requests_total} ({p.requests_released} released)</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <BottomSheet
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title="Log a repair job"
        footer={<LoadingButton type="submit" form="project-form" loading={saving}>{saving ? "Saving…" : "Add project"}</LoadingButton>}
      >
        <form id="project-form" onSubmit={submit} className="space-y-4" noValidate>
          <ErrorBanner>{errors._general?.[0]}</ErrorBanner>
          {field("name", "Project name", "e.g. Ice plant compressor repair")}
          {field("description", "Description", "What the job is and what is needed", true)}
          {field("location", "Location", "e.g. Blk 5 Lot 2, Muzon, San Jose del Monte, Bulacan")}
          <p className="text-[13px] text-slate-500">Admin sets the owner, budget, dates, status and priority. These three fields cannot be changed after saving.</p>
        </form>
      </BottomSheet>
    </RoleShell>
  );
}
