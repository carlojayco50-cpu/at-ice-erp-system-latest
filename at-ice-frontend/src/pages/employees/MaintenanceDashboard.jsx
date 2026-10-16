import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RoleShell from "../../components/RoleShell";
import { Icon, StatusBadge, ErrorBanner, CardSkeleton, EmptyCard } from "../../components/MobileUi";
import { CARD, CARD_BUTTON } from "../../lib/mobileUi";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";

const headers = () => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` });

// Maintenance home: urgent items first (stuck or overdue projects, rejected
// requests), then the request counts and the way into Parts and Projects.
export default function MaintenanceDashboard() {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [r, p] = await Promise.all([
        fetch("/api/stock-out-requests", { headers: headers() }),
        fetch("/api/my-projects", { headers: headers() }),
      ]);
      if (!r.ok || !p.ok) throw new Error("Could not load your requests and projects.");
      const [rd, pd] = await Promise.all([r.json(), p.json()]);
      setRequests(Array.isArray(rd) ? rd : rd.data || []);
      setProjects(Array.isArray(pd) ? pd : []);
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, []);
  const live = useLiveTick(["stock-out", "projects"]);
  useEffect(() => { load(); }, [load, live]);

  const weekAgo = Date.now() - 7 * 864e5;
  const urgent = [
    ...projects.filter((p) => p.status === "stuck").map((p) => ({ key: `p${p.id}`, title: p.name, text: "Project is stuck. Talk to Admin about what is blocking it.", to: "/maintenance/projects", badge: "Stuck" })),
    ...projects.filter((p) => p.overdue && p.status !== "stuck").map((p) => ({ key: `o${p.id}`, title: p.name, text: "Project is past its due date.", to: "/maintenance/projects", badge: "Overdue" })),
    ...requests.filter((r) => r.status === "rejected" && new Date(r.updated_at || r.created_at).getTime() >= weekAgo)
      .map((r) => ({ key: `r${r.id}`, title: r.product?.name || r.item_name, text: r.rejection_reason ? `Rejected: ${r.rejection_reason}` : "Request was rejected.", to: "/maintenance/stock-out-request?status=rejected", badge: "Rejected" })),
  ];
  const count = (s) => requests.filter((r) => r.status === s).length;

  return (
    <RoleShell role="maintenance" title="Maintenance">
      <div className="text-[14px] text-slate-500">
        {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>

      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {status === "ready" && (
        <>
          {urgent.length > 0 && (
            <section aria-label="Needs attention" className="space-y-3">
              {urgent.map((u) => (
                <Link key={u.key} to={u.to} className={`${CARD_BUTTON} block border-rose-200`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-slate-900 truncate">{u.title}</div>
                      <div className="text-[14px] text-rose-700 mt-1">{u.text}</div>
                    </div>
                    <StatusBadge tone="urgent">{u.badge}</StatusBadge>
                  </div>
                </Link>
              ))}
            </section>
          )}

          <section aria-label="Parts requests by status" className="grid grid-cols-3 gap-3">
            {[["Pending", "pending"], ["Approved", "approved"], ["Released", "released"]].map(([label, s]) => (
              <Link key={s} to={`/maintenance/stock-out-request?status=${s}`} className={`${CARD_BUTTON} block text-center !p-3`}>
                <div className="text-2xl font-bold text-slate-900 tabular-nums">{count(s)}</div>
                <StatusBadge status={s} className="mt-1">{label}</StatusBadge>
              </Link>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-3">
            <Link to="/maintenance/stock-out-request?new=1" className={`${CARD_BUTTON} flex items-center gap-3`}>
              <span className="w-11 h-11 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center flex-shrink-0"><Icon name="wrench" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-slate-900">Request parts</span>
                <span className="block text-[14px] text-slate-500">Truck parts or machine components from the inventory</span>
              </span>
              <Icon name="chevron" className="text-slate-300" />
            </Link>
            <Link to="/maintenance/projects?new=1" className={`${CARD_BUTTON} flex items-center gap-3`}>
              <span className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Icon name="clipboard" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-slate-900">Log a repair job</span>
                <span className="block text-[14px] text-slate-500">Add a project for Admin to schedule</span>
              </span>
              <Icon name="chevron" className="text-slate-300" />
            </Link>
          </div>

          <section aria-label="Latest requests" className="space-y-3">
            <h2 className="text-[15px] font-semibold text-slate-900">Latest requests</h2>
            {requests.length === 0 ? (
              <EmptyCard icon="wrench" title="No requests yet">Tap Request parts to ask for an item.</EmptyCard>
            ) : requests.slice(0, 3).map((r) => (
              <div key={r.id} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900 truncate">{r.product?.name || r.item_name}</div>
                    <div className="text-[14px] text-slate-500">Qty {r.quantity} {r.product?.unit || ""} · {formatDateTime(r.created_at, { year: false })}</div>
                  </div>
                  <StatusBadge status={r.status} className="capitalize">{r.status}</StatusBadge>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </RoleShell>
  );
}
