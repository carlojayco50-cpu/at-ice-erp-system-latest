import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonTableRows } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { Modal } from "./deliveries/shared";
import { toast } from "../../lib/toast";

// Admin > HRIS > Performance (owner, 2026-10-20). Every active employee gets a
// Draft Base Rating each pay period from the records (attendance, punctuality
// and the role's work done; App\Support\PerformanceScore). Only Admin can
// override the rating or the goal, write remarks and publish the appraisal.

const SearchIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const selectCls = "px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60";
const inputCls = "w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500";

// One meaning per color: best emerald, good cyan, fair blue, low amber, poor rose
const RATING_STYLE = {
  "Outstanding": "bg-emerald-100 border-emerald-200 text-emerald-800",
  "Very Satisfactory": "bg-cyan-100 border-cyan-200 text-cyan-800",
  "Satisfactory": "bg-blue-100 border-blue-200 text-blue-800",
  "Needs Improvement": "bg-amber-100 border-amber-200 text-amber-800",
  "Poor": "bg-rose-100 border-rose-200 text-rose-800",
};
const STATUS_STYLE = {
  draft: ["Draft", "bg-violet-100 border-violet-200 text-violet-800"],
  published: ["Published", "bg-blue-100 border-blue-200 text-blue-800"],
};
const ROLE_LABEL = { driver: "Deliveries", salesman: "Confirmations", checker: "Counts and movements", maintenance: "Requests and projects" };

const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const periodLabel = (p) => `${day(p.start)} – ${day(p.end)}, ${p.end.slice(0, 4)}`;
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);

function api(path, opts = {}) {
  return fetch(`/api/${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  });
}

const NO_FILTER = { q: "", department: "", rating: "" };

export default function PerformancePage() {
  const [data, setData] = useState({ rows: [], periods: [], labels: [], period: null });
  const [periodStart, setPeriodStart] = useState("");
  const [filter, setFilter] = useState(NO_FILTER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api(`performance${periodStart ? `?period_start=${periodStart}` : ""}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [periodStart]);
  const live = useLiveTick(["attendance", "deliveries", "employees"]);
  useEffect(() => { load(); }, [load, live]);

  const departments = useMemo(() => [...new Set(data.rows.map((r) => r.department).filter(Boolean))].sort(), [data.rows]);
  const q = filter.q.trim().toLowerCase();
  const filtered = data.rows.filter((r) =>
    (!q || `${r.code} ${r.name}`.toLowerCase().includes(q))
    && (!filter.department || (filter.department === "none" ? !r.department : r.department === filter.department))
    && (!filter.rating || r.rating_label === filter.rating));
  const filtering = !!(filter.q || filter.department || filter.rating);
  const pager = usePagination(filtered);

  const saved = (row) => {
    setData((d) => ({ ...d, rows: d.rows.map((r) => (r.employee_id === row.employee_id ? row : r)) }));
    setReviewing(null);
  };

  return (
    <AdminLayout pageTitle="Performance" breadcrumb="HRIS / Performance">
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">Performance</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Draft ratings come from attendance, punctuality and each role's work this pay period. Review one to set the final rating, goal and remarks, then publish.
            </div>
          </div>
          {!loading && <div className="text-[11px] text-slate-400 whitespace-nowrap">{filtering ? `${filtered.length} of ${data.rows.length}` : data.rows.length} employees</div>}
        </div>

        <div role="search" aria-label="Filter appraisals" className="px-5 py-3 bg-slate-50 border-b border-black/[0.09] flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-500 flex-1 min-w-[200px] max-w-[280px] focus-within:border-cyan-500/60">
            <SearchIcon />
            <input type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="Search employee ID or name" aria-label="Search by employee ID or name"
              className="bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-500" />
          </div>
          <select aria-label="Department" value={filter.department} onChange={(e) => setFilter({ ...filter, department: e.target.value })} className={selectCls}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value="none">No department</option>
          </select>
          <select aria-label="Rating" value={filter.rating} onChange={(e) => setFilter({ ...filter, rating: e.target.value })} className={selectCls}>
            <option value="">All Ratings</option>
            {data.labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select aria-label="Pay period" value={periodStart || data.period?.start || ""} onChange={(e) => setPeriodStart(e.target.value)} className={selectCls}>
            {data.periods.map((p, i) => <option key={p.start} value={p.start}>{i === 0 ? `This period (${periodLabel(p)})` : periodLabel(p)}</option>)}
          </select>
          {filtering && (
            <button type="button" onClick={() => setFilter(NO_FILTER)} className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Clear filters</button>
          )}
        </div>

        {error && (
          <div className="mx-5 mt-4 px-3.5 py-2.5 bg-red-500/[0.06] border border-red-500/20 rounded-md text-xs text-red-600">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.06em] uppercase text-slate-400 border-b border-black/[0.09]">
                <th className="px-5 py-2.5 font-medium">Employee</th>
                <th className="px-5 py-2.5 font-medium">Department</th>
                <th className="px-5 py-2.5 font-medium">Performance Score</th>
                <th className="px-5 py-2.5 font-medium">Goal Completion</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={6} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-xs">
                  {filtering ? "No employees match these filters." : "No active employees yet."}
                </td></tr>
              ) : (
                pager.pageItems.map((r) => {
                  const [statusText, statusCls] = STATUS_STYLE[r.status] || STATUS_STYLE.draft;
                  return (
                    <tr key={r.employee_id} className="border-b border-black/[0.06] last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-800">{r.name}</div>
                        <div className="text-[11px] text-slate-400">{r.code}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.department || <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-3">
                        {r.rating == null ? <span className="text-slate-400 text-xs">No work days yet</span> : (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${RATING_STYLE[r.rating_label] || ""}`}>
                              <span className="tabular-nums">{Number(r.rating).toFixed(1)}</span> {r.rating_label}
                            </span>
                            {r.overridden && <span className="text-[10px] text-slate-400">Draft {Number(r.base_rating).toFixed(1)} · set by Admin</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {r.goal_completion == null ? <span className="text-slate-300">—</span> : (
                          <div className="inline-flex flex-col items-center gap-1 min-w-[110px]">
                            <span className="text-[12px] font-semibold text-slate-700 tabular-nums">{pct(r.goal_completion)}</span>
                            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
                              <div className="h-full bg-cyan-600" style={{ width: `${Math.min(100, r.goal_completion)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 tabular-nums">{r.goal_done} of {r.goal_target}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${statusCls}`}>{statusText}</span>
                      </td>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => setReviewing(r)} data-no-confirm data-tip="Opens the draft, rating, goal and remarks of this employee"
                          className="px-2.5 py-1 rounded-md border border-black/[0.09] text-[12px] text-slate-700 hover:bg-slate-50 cursor-pointer">
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} label="employees" />
      </div>

      {reviewing && (
        <ReviewModal row={reviewing} period={data.period} onClose={() => setReviewing(null)} onSaved={saved} />
      )}
    </AdminLayout>
  );
}

// Draft breakdown and Admin's override for one employee and pay period.
function ReviewModal({ row, period, onClose, onSaved }) {
  const [form, setForm] = useState({
    final_rating: row.final_rating ?? "",
    goal_target: row.role ? (row.goal_target ?? "") : "",
    remarks: row.remarks ?? "",
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function save(publish) {
    setBusy(publish ? "publish" : "save");
    setError("");
    try {
      const res = await api(`performance/${row.employee_id}?period_start=${period.start}`, {
        method: "PUT",
        body: JSON.stringify({
          final_rating: form.final_rating === "" ? null : Number(form.final_rating),
          goal_target: form.goal_target === "" ? null : Number(form.goal_target),
          remarks: form.remarks || null,
          publish,
        }),
      });
      toast.success(res.message);
      onSaved(res.row);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const stat = (label, value, sub) => (
    <div className="rounded-lg border border-black/[0.09] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-400">{label}</div>
      <div className="text-[16px] font-semibold text-slate-800 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <Modal title={`Appraisal · ${row.name}`} onClose={onClose} wide>
      <div className="p-5 flex flex-col gap-4">
        <div className="text-[12px] text-slate-500">{row.code} · {row.position || "—"} · {periodLabel(period)}</div>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stat("Attendance", pct(row.attendance_rate), `${row.present_days} of ${row.work_days} work days`)}
          {stat("Punctuality", pct(row.punctuality_rate), `${row.on_time_days} on time`)}
          {stat("Goal", row.role ? pct(row.goal_completion) : "—", row.role ? `${ROLE_LABEL[row.role]}: ${row.goal_done} of ${row.goal_target}` : "No work goal for this role")}
          {stat("Draft rating", row.base_rating == null ? "—" : Number(row.base_rating).toFixed(1), row.score == null ? "No work days yet" : `Score ${row.score} of 100`)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block" htmlFor="perf-final">Final rating (1.0 – 5.0)</label>
            <input id="perf-final" type="number" min="1" max="5" step="0.1" value={form.final_rating}
              onChange={(e) => setForm({ ...form, final_rating: e.target.value })}
              placeholder={row.base_rating == null ? "—" : `Leave blank to use the draft (${Number(row.base_rating).toFixed(1)})`} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block" htmlFor="perf-goal">Goal this pay period</label>
            <input id="perf-goal" type="number" min="1" step="1" value={form.goal_target} disabled={!row.role}
              onChange={(e) => setForm({ ...form, goal_target: e.target.value })}
              placeholder={row.role ? `Default ${row.goal_target}` : "No work goal for this role"} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-slate-500 mb-1 block" htmlFor="perf-remarks">Appraisal remarks</label>
          <textarea id="perf-remarks" rows={3} maxLength={2000} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="Strengths, areas to improve and agreed next steps" className={inputCls} />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.09]">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px] hover:bg-slate-50">Close</button>
          <button type="button" onClick={() => save(false)} disabled={!!busy}
            data-confirm="The rating, goal and remarks are saved as a draft." data-confirm-title={`Save the appraisal of ${row.name}?`}
            className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-700 text-[12px] font-medium hover:bg-slate-50 disabled:opacity-50">
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={() => save(true)} disabled={!!busy}
            data-confirm="The appraisal becomes final for this pay period. You can still change it later." data-confirm-title={`Publish the appraisal of ${row.name}?`}
            className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50">
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
