import { useState, useEffect, useCallback, useMemo } from "react";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonTableRows } from "../../components/Skeleton";
import { fullName, shiftLabel } from "../../lib/names";
import { useLiveTick } from "../../lib/live";

const API_BASE = "/api";

const SearchIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;

const SUB_ROLE_STYLE = {
  checker:     "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  salesman:    "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  maintenance: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  driver:      "bg-violet-500/10 text-violet-600 border-violet-500/20",
  guard:       "bg-blue-500/10 text-blue-600 border-blue-500/20",
  bagger:      "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

// Guards and Baggers have no account: their Position is the role.
function displayRole(emp) {
  const user = emp?.user;
  if (!user) return ["Guard", "Bagger"].includes(emp?.position) ? emp.position.toLowerCase() : null;
  if (user.role === "driver") return "driver";
  return user.sub_role || null;
}

const ROLE_LABEL = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "No role");

// "day" or "night" like App\Support\Lateness::label: night when the shift ends the next day.
function shiftKind(emp) {
  const start = String(emp?.shift_start || "").slice(0, 5);
  const end = String(emp?.shift_end || "").slice(0, 5);
  if (start && end) return end <= start ? "night" : "day";
  return emp?.shift === "night" ? "night" : emp?.shift ? "day" : "";
}

const NO_FILTER = { q: "", position: "", role: "", shift: "" };
const selectCls = "px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60";

export default function EmployeesOverviewPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState(NO_FILTER);

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
      const res = await fetch(`${API_BASE}/employees-summary`, { headers: authHeaders });
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
  const live = useLiveTick(["employees"]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees, live]);

  // Dropdown options come from the list itself, so they match what is shown.
  const positions = useMemo(() => [...new Set(employees.map((e) => e.position).filter(Boolean))].sort(), [employees]);
  const roles = useMemo(() => [...new Set(employees.map((e) => displayRole(e) || ""))].sort(), [employees]);
  const shiftRanges = useMemo(() => [...new Set(employees.map((e) => shiftLabel(e)).filter((l) => l && l !== "—"))].sort(), [employees]);

  const filtering = Boolean(filter.q.trim() || filter.position || filter.role || filter.shift);
  const filtered = employees.filter((e) => {
    const q = filter.q.trim().toLowerCase();
    if (q && !`${e.employee_id || ""} ${fullName(e)}`.toLowerCase().includes(q)) return false;
    if (filter.position && e.position !== filter.position) return false;
    if (filter.role !== "" && (displayRole(e) || "none") !== filter.role) return false;
    if (filter.shift === "day" || filter.shift === "night") return shiftKind(e) === filter.shift;
    if (filter.shift && shiftLabel(e) !== filter.shift) return false;
    return true;
  });

  return (
    <AdminLayout pageTitle="Employees" breadcrumb="Employees">
      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.09]">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">Employees</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Registered staff. Account creation and edits are managed by HR.
            </div>
          </div>
          {!loading && <div className="text-[11px] text-slate-400">{filtering ? `${filtered.length} of ${employees.length}` : employees.length} employee{employees.length === 1 ? "" : "s"}</div>}
        </div>

        <div role="search" aria-label="Filter employees" className="px-5 py-3 bg-slate-50 border-b border-black/[0.09] flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-500 flex-1 min-w-[200px] max-w-[280px] focus-within:border-cyan-500/60">
            <SearchIcon />
            <input
              type="search"
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="Employee ID or name"
              aria-label="Search by employee ID or name"
              className="bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-500"
            />
          </div>
          <select aria-label="Position" value={filter.position} onChange={(e) => setFilter({ ...filter, position: e.target.value })} className={selectCls}>
            <option value="">All positions</option>
            {positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Role" value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value })} className={selectCls}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r || "none"} value={r || "none"}>{ROLE_LABEL(r)}</option>)}
          </select>
          <select aria-label="Shift" value={filter.shift} onChange={(e) => setFilter({ ...filter, shift: e.target.value })} className={selectCls}>
            <option value="">All shifts</option>
            <option value="day">Day shift</option>
            <option value="night">Night shift</option>
            {shiftRanges.length > 0 && (
              <optgroup label="Shift hours">
                {shiftRanges.map((r) => <option key={r} value={r}>{r}</option>)}
              </optgroup>
            )}
          </select>
          {filtering && (
            <button type="button" onClick={() => setFilter(NO_FILTER)} className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Clear filters</button>
          )}
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
                <th className="px-5 py-2.5 font-medium">Position</th>
                <th className="px-5 py-2.5 font-medium">Role</th>
                <th className="px-5 py-2.5 font-medium">Shift</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={4} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400 text-xs">
                  {filtering ? "No employees match these filters." : "No employees registered yet."}
                </td></tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="border-b border-black/[0.06] last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{fullName(emp)}</div>
                      <div className="text-[11px] text-slate-400">{emp.employee_id}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{emp.position}</td>
                    <td className="px-5 py-3">
                      {displayRole(emp) ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${SUB_ROLE_STYLE[displayRole(emp)] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          {displayRole(emp).charAt(0).toUpperCase() + displayRole(emp).slice(1)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap font-mono text-[12px]">{shiftLabel(emp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}