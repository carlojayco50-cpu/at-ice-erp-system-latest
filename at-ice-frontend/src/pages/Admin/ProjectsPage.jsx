import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { BoardGroup, BoardRow, StatusCell } from "../../components/Board";
import { SkeletonList } from "../../components/Skeleton";
import { TONES } from "../../lib/boardTones";
import { useLiveTick } from "../../lib/live";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { initialsOf } from "../../lib/initials";

// Admin > Projects: a monday.com-style board of maintenance and plant jobs.
// Groups by status, a colored status and priority cell per project, a
// timeline bar, and the supplies each project used: Maintenance picks the
// project when filing a stock-out request, and a released request counts as
// used at the item's unit price (ProjectController).

const STATUS = {
  working: { label: "Working on it", tone: "working" },
  stuck: { label: "Stuck", tone: "stuck" },
  planned: { label: "Planned", tone: "info" },
  done: { label: "Done", tone: "done" },
};
const PRIORITY = {
  critical: { label: "Critical", tone: "stuck" },
  high: { label: "High", tone: "high" },
  medium: { label: "Medium", tone: "purple" },
  low: { label: "Low", tone: "idle" },
};
const REQUEST_STATUS = { pending: "info", approved: "purple", released: "done", rejected: "stuck" };

const EMPTY = { name: "", description: "", location: "", status: "planned", priority: "medium", owner: "", start_date: "", due_date: "", budget: "" };

const token = () => localStorage.getItem("token") || "";
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 });
const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "");

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.errors ? Object.values(data.errors)[0][0] : data?.message || `Request failed (${res.status}).`);
    err.errors = data?.errors || null;
    throw err;
  }
  return data;
}

// A colored cell with a hidden select on top, so the status or priority is
// changed right on the board like on monday.com.
function PickCell({ value, options, onPick, label }) {
  const opt = options[value] || Object.values(options)[0];
  return (
    <div className="relative h-full">
      <StatusCell tone={opt.tone}>{opt.label}</StatusCell>
      <select
        aria-label={label}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {Object.entries(options).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Timeline({ p }) {
  if (!p.start_date && !p.due_date) return <span className="text-slate-300">—</span>;
  const pct = p.progress ?? 0;
  const color = p.overdue ? TONES.stuck.edge : p.status === "done" ? TONES.done.edge : TONES.info.edge;
  return (
    <div className="min-w-[120px]" title={p.overdue ? "Past the due date" : `${pct}% of the time used`}>
      <div className="relative h-5 rounded-full bg-slate-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color }} />
        <span className="relative z-10 flex items-center justify-center h-full text-[10px] font-semibold text-slate-700">
          {day(p.start_date) || "?"} – {day(p.due_date) || "?"}
        </span>
      </div>
      {p.overdue && <div className="text-[10px] text-[#b4233c] font-semibold mt-0.5">Overdue</div>}
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());
  // Kept as a draft while the modal is open, so a refresh reopens it as it was.
  const formDraft = useDraft("projects:form", { editing: null, form: EMPTY }, { when: (v) => !!v.editing });
  const { editing, form } = formDraft.values; // editing: null closed, {} new, project edit
  const { editing: setEditing, form: setForm } = formDraft.set;
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      setProjects(await api("/api/projects"));
      setError("");
    } catch (e) {
      setError(e.message || "Could not load the projects.");
    } finally {
      setLoading(false);
    }
  }, []);
  const live = useLiveTick(["projects", "stock-out"]);
  useEffect(() => { load(); }, [load, live]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? projects.filter((p) => `${p.name} ${p.owner || ""} ${p.description || ""}`.toLowerCase().includes(q)) : projects;
  }, [projects, search]);

  const totals = useMemo(() => ({
    open: projects.filter((p) => p.status !== "done").length,
    stuck: projects.filter((p) => p.status === "stuck").length,
    overdue: projects.filter((p) => p.overdue).length,
    cost: projects.reduce((s, p) => s + Number(p.materials_cost || 0), 0),
  }), [projects]);

  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Status or priority changed on the board
  const quickUpdate = async (p, patch) => {
    setProjects((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    try {
      const saved = await api(`/api/projects/${p.id}`, { method: "PUT", body: JSON.stringify(patch) });
      setProjects((list) => list.map((x) => (x.id === p.id ? saved : x)));
    } catch (e) {
      toast.error(e.message);
      load();
    }
  };

  const openEdit = (p) => {
    setForm({
      name: p.name || "", description: p.description || "", location: p.location || "", status: p.status, priority: p.priority,
      owner: p.owner || "", start_date: p.start_date || "", due_date: p.due_date || "",
      budget: p.budget != null ? String(Number(p.budget)) : "",
    });
    setFormErrors({});
    setEditing(p);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      return setFormErrors({ due_date: ["The due date cannot be before the start date."] });
    }
    // Name, description and location are Maintenance's and are not sent.
    const body = JSON.stringify({
      status: form.status,
      priority: form.priority,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      budget: form.budget === "" ? null : Number(form.budget),
      owner: form.owner.trim() || null,
    });
    setSaving(true);
    try {
      await api(`/api/projects/${editing.id}`, { method: "PUT", body });
      toast.success("Project was updated.");
      setEditing(null);
      load();
    } catch (err) {
      setFormErrors(err.errors || { _general: [err.message] });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const p = deleting;
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      toast.success("Project was removed.");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    { label: "Project" }, { label: "Owner" }, { label: "Status", className: "w-[130px]" }, { label: "Priority", className: "w-[100px]" },
    { label: "Timeline" }, { label: "Supplies" }, { label: "Cost / Budget" }, { label: "" },
  ];

  return (
    <AdminLayout
      pageTitle="Projects"
      breadcrumb="Inventory / Projects"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Open projects", totals.open, "info"],
          ["Stuck", totals.stuck, "stuck"],
          ["Overdue", totals.overdue, "stuck"],
          ["Supplies used", peso(totals.cost), "done"],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-white border border-black/[0.09] rounded-xl p-4" style={{ boxShadow: `inset 4px 0 0 ${TONES[tone].edge}` }}>
            <div className="text-[11px] text-slate-400">{label}</div>
            <div className="text-[22px] font-semibold text-slate-800 tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-black/[0.09] rounded-xl p-[18px] flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">Project board</div>
            <div className="text-[11px] text-slate-400">Maintenance adds projects from their portal. Set the owner, budget, dates, status and priority here. Click a project to see the supplies it used.</div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project or owner…"
              aria-label="Search project or owner"
              className="px-3 py-2 border border-black/[0.09] rounded-md text-xs flex-1 min-w-0 sm:flex-none sm:w-56 outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {error && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-600">{error}</div>}
        {loading ? <SkeletonList rows={4} /> : Object.entries(STATUS).map(([key, s]) => {
          const rows = filtered.filter((p) => p.status === key);
          if (key === "done" && !rows.length) return null;
          return (
            <BoardGroup key={key} title={s.label} tone={s.tone} count={rows.length} columns={columns} empty={key === "planned" ? "No planned projects. Maintenance adds them from their portal." : "None."}>
              {rows.map((p) => (
                <Fragment key={p.id}>
                  <BoardRow
                    tone={s.tone}
                    onClick={() => toggle(p.id)}
                    title="Show the supplies used"
                    cells={[
                      <div key="n" className="min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] text-slate-400 transition-transform ${open.has(p.id) ? "rotate-90" : ""}`} aria-hidden="true">▶</span>
                          {p.name}
                        </div>
                        {p.description && <div className="text-[11px] font-normal text-slate-400 truncate max-w-[260px]">{p.description}</div>}
                        {p.location && <div className="text-[11px] font-normal text-slate-500 truncate max-w-[260px]" title={p.location}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" className="inline -mt-0.5 mr-0.5"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>{p.location}</div>}
                      </div>,
                      p.owner ? (
                        <span key="o" title={p.owner} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0073ea] text-white text-[10px] font-semibold">{initialsOf(p.owner, "?")}</span>
                      ) : <span key="o" className="text-slate-300">—</span>,
                      <PickCell key="s" value={p.status} options={STATUS} label={`Status of ${p.name}`} onPick={(v) => quickUpdate(p, { status: v })} />,
                      <PickCell key="p" value={p.priority} options={PRIORITY} label={`Priority of ${p.name}`} onPick={(v) => quickUpdate(p, { priority: v })} />,
                      <Timeline key="t" p={p} />,
                      <span key="r" className="text-[11px]">
                        <b className="text-slate-800">{p.requests_released}</b> used
                        {p.requests_waiting > 0 && <span className="text-[#9f1239]"> · {p.requests_waiting} waiting</span>}
                      </span>,
                      <span key="c" className="text-[11px] font-mono">
                        <b className="text-slate-800">{peso(p.materials_cost)}</b>
                        {p.budget != null && <span className={p.budget_left < 0 ? "text-[#b4233c]" : "text-slate-400"}> / {peso(p.budget)}</span>}
                      </span>,
                      <span key="a" className="flex items-center justify-center gap-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="px-2 py-1 text-[11px] rounded border border-black/[0.09] text-slate-600 hover:border-cyan-400 cursor-pointer">Edit</button>
                        <button data-no-confirm type="button" onClick={(e) => { e.stopPropagation(); setDeleting(p); }} className="px-2 py-1 text-[11px] rounded border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer">Delete</button>
                      </span>,
                    ]}
                  />
                  {open.has(p.id) && (
                    <tr>
                      <td colSpan={columns.length} className="bg-slate-50/70 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${TONES[s.tone].edge}` }}>
                        {(p.stock_out_requests || []).length === 0 ? (
                          <div className="text-[11px] text-slate-400">No stock-out requests for this project yet. Maintenance picks it when filing a request.</div>
                        ) : (
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-slate-400 text-left"><th className="py-1 font-medium">Item</th><th className="font-medium">Qty</th><th className="font-medium">Requested by</th><th className="font-medium">Date</th><th className="font-medium w-[100px]">Status</th></tr></thead>
                            <tbody>
                              {p.stock_out_requests.map((r) => (
                                <tr key={r.id} className="border-t border-black/[0.06]">
                                  <td className="py-1.5 text-slate-700">{r.product?.name || r.item_name}</td>
                                  <td className="text-slate-600">{r.quantity} {r.product?.unit || ""}</td>
                                  <td className="text-slate-600">{r.requested_by?.name || "—"}</td>
                                  <td className="text-slate-500">{day(r.created_at)}</td>
                                  <td className="p-0"><StatusCell tone={REQUEST_STATUS[r.status] || "idle"} className="capitalize">{r.status}</StatusCell></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </BoardGroup>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-black/[0.09] w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3.5 border-b border-black/[0.09] text-[14px] font-semibold text-slate-800">Edit project</div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <DraftHint draft={formDraft} className="col-span-2" />
              {formErrors._general && <div className="col-span-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-600">{formErrors._general[0]}</div>}
              {/* Set by Maintenance when they added the project: shown, not edited */}
              <div className="col-span-2 rounded-lg border border-black/[0.07] bg-slate-50 px-3 py-2.5 flex flex-col gap-1.5">
                <div className="text-[10.5px] uppercase tracking-wider text-slate-400">From Maintenance</div>
                {[["Project name", editing.name], ["Description", editing.description], ["Location", editing.location]].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[100px_1fr] gap-2 text-[12.5px]">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-800 break-words">{value || "—"}</span>
                  </div>
                ))}
              </div>
              {[
                ["owner", "Owner", "text", "Who is in charge", false],
                ["budget", "Budget (₱)", "number", "Optional", false],
                ["start_date", "Start date", "date", "", false],
                ["due_date", "Due date", "date", "", false],
              ].map(([key, label, type, ph, wide]) => (
                <label key={key} className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
                  <span className="text-[11px] text-slate-500">{label}</span>
                  <input
                    type={type}
                    value={form[key]}
                    min={type === "number" ? 0 : key === "due_date" ? form.start_date || undefined : undefined}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={ph}
                    className="px-2.5 py-2 border border-black/[0.09] rounded-md text-[13px] outline-none focus:border-cyan-400"
                  />
                  {formErrors[key] && <span className="text-[10px] text-red-500">{formErrors[key][0]}</span>}
                </label>
              ))}
              {[["status", "Status", STATUS], ["priority", "Priority", PRIORITY]].map(([key, label, opts]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-500">{label}</span>
                  <select value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="px-2.5 py-2 border border-black/[0.09] rounded-md text-[13px] outline-none focus:border-cyan-400">
                    {Object.entries(opts).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-black/[0.09] flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="px-3.5 py-2 rounded-md border border-black/[0.09] text-xs text-slate-600 cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDeleting(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-black/[0.09] w-full max-w-sm p-5">
            <div className="text-[14px] font-semibold text-slate-800">Delete project?</div>
            <p className="text-[12px] text-slate-500 mt-1.5">
              <b>{deleting.name}</b> will be removed from the board. Its stock-out requests stay in the records, without a project.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleting(null)} className="px-3.5 py-2 rounded-md border border-black/[0.09] text-xs text-slate-600 cursor-pointer">Cancel</button>
              <button onClick={remove} className="px-3.5 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// Fills its board cell edge to edge, like a StatusCell (components/Board.jsx).
PickCell.boardFill = true;
