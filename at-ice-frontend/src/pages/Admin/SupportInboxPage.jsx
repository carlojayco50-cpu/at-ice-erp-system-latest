import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";
import FilterSelect from "../../components/FilterSelect";
import EmptyState from "../../components/EmptyState";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { ActivityFeed, StatusBreakdown, TipsWidget } from "../../components/Insight";
import { toast } from "../../lib/toast";

// Support Tickets (dispatch room): every message a customer sends from Contact
// Support is a ticket (TKT-20261022-001) with a priority, an assignee, replies
// the customer sees, internal notes only the Admin sees, and a resolution note.
// Only the Admin receives them. The list is loaded once; filters, KPI cards and
// side panels work from it, and a picked ticket opens in the side panel.

const authHeaders = (extra = {}) => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  ...extra,
});

const STATUS = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "In progress", cls: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PRIORITY = {
  high: { label: "High", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "Low", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const TOPIC_TONES = ["cyan", "amber", "violet", "emerald", "rose", "slate"];

const isActive = (t) => t.status === "open" || t.status === "in_progress";

// "4m", "18h", "2d" since the ticket came in
function age(from, to = Date.now()) {
  const mins = Math.max(0, Math.floor((to - new Date(from)) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function Pill({ map, value }) {
  const s = map[value] || { label: value, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

async function send(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = data.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new Error(first || data.message || `Could not update the ticket (${res.status})`);
  }
  return data;
}

// The picked ticket: details, priority and assignee, the thread, and the actions.
function TicketPanel({ id, assignees, overdueHours, onChanged, onClose }) {
  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/support-messages/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not load the ticket (${res.status})`);
      setT(await res.json());
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setT(null);
    setText("");
    setNote("");
    setResolving(false);
    load();
  }, [load]);

  const run = async (key, url, method, body, done) => {
    setBusy(key);
    setError("");
    try {
      const data = await send(url, method, body);
      setT(data);
      if (done) toast.success(done);
      onChanged();
      return true;
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  const post = async (kind) => {
    if (text.trim().length < 2) {
      setError(kind === "reply" ? "Write the reply first." : "Write the note first.");
      return;
    }
    if (await run(kind, `/api/support-messages/${id}/replies`, "POST", { kind, body: text.trim() }, kind === "reply" ? "Reply sent to the customer." : "Internal note added.")) setText("");
  };

  const resolve = async () => {
    if (note.trim().length < 5) {
      setError("Write what was done before resolving the ticket.");
      return;
    }
    if (await run("resolve", `/api/support-messages/${id}/resolve`, "PATCH", { resolution_note: note.trim() }, "Ticket resolved.")) {
      setResolving(false);
      setNote("");
    }
  };

  if (!t) {
    return (
      <div className="bg-white border border-black/[0.09] rounded-xl p-5">
        {error ? <div className="text-[12px] text-red-600">{error}</div> : <SkeletonList />}
      </div>
    );
  }

  const active = isActive(t);
  const overdue = active && Date.now() - new Date(t.created_at) > overdueHours * 3600000;
  const fieldCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60";

  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden xl:sticky xl:top-0">
      <div className="px-5 py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-slate-800">{t.ticket_no}</span>
        <Pill map={PRIORITY} value={t.priority} />
        <Pill map={STATUS} value={t.status} />
        {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-rose-50 text-rose-800 border-rose-200">Overdue</span>}
        <button type="button" onClick={onClose} title="Close this panel" data-no-confirm className="ml-auto px-2 py-1 rounded-md text-[12px] text-slate-500 hover:bg-slate-50 cursor-pointer">
          Close panel
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400">Customer</div>
            <div className="text-slate-800 font-medium">{t.customer?.name || "Customer"}</div>
            <div className="text-slate-500">{[t.customer?.contact_person, t.customer?.contact_number].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400">Category</div>
            <div className="text-slate-800">{t.topic_label}</div>
            <div className="text-slate-500">Received {formatDateTime(t.created_at, { year: false })}</div>
          </div>
          <label className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1">Priority</div>
            <select
              value={t.priority}
              disabled={!active || busy === "priority"}
              onChange={(e) => run("priority", `/api/support-messages/${id}`, "PATCH", { priority: e.target.value }, "Priority changed.")}
              className={fieldCls}
            >
              {Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1">Assigned to</div>
            <select
              value={t.assigned_to ?? ""}
              disabled={!active || busy === "assign"}
              onChange={(e) => run("assign", `/api/support-messages/${id}`, "PATCH", { assigned_to: e.target.value ? Number(e.target.value) : null }, "Ticket assigned.")}
              className={fieldCls}
            >
              <option value="">Nobody yet</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Conversation</div>
          <div className="space-y-2.5">
            <div className="border-l-2 border-slate-300 pl-3">
              <div className="text-[11px] text-slate-400">{t.customer?.name || "Customer"} · {formatDateTime(t.created_at, { year: false })}</div>
              <div className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">{t.message}</div>
            </div>
            {(t.replies || []).map((r) => (
              <div key={r.id} className={`border-l-2 pl-3 ${r.kind === "note" ? "border-amber-300 bg-amber-50/50 py-1 rounded-r" : r.kind === "customer" ? "border-slate-300" : "border-cyan-400"}`}>
                <div className="text-[11px] text-slate-400">
                  {r.kind === "customer"
                    ? `${t.customer?.name || "Customer"} · ${formatDateTime(r.created_at, { year: false })}`
                    : `${r.kind === "note" ? "Internal note · Admin only" : "Reply to customer"} · ${r.user?.name || "Admin"} · ${formatDateTime(r.created_at, { year: false })}`}
                </div>
                <div className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">{r.body}</div>
              </div>
            ))}
            {t.resolution_note && (
              <div className="border-l-2 border-emerald-400 pl-3">
                <div className="text-[11px] text-slate-400">
                  Resolution · {t.resolver?.name || "Admin"} · {formatDateTime(t.resolved_at, { year: false })}
                </div>
                <div className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">{t.resolution_note}</div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="text-[12px] text-red-600">{error}</div>}

        {t.status !== "closed" && !resolving && (
          <div className="space-y-2">
            <textarea
              rows={3}
              value={text}
              maxLength={2000}
              onChange={(e) => { setText(e.target.value); setError(""); }}
              placeholder="Write a reply to the customer, or a note for the Admin team"
              className={`${fieldCls} text-[13px] resize-y`}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy === "reply"} onClick={() => post("reply")} title="The customer sees this reply in their portal" className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer disabled:opacity-50">
                Send reply
              </button>
              <button type="button" disabled={busy === "note"} onClick={() => post("note")} title="Only the Admin team sees internal notes" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                Add internal note
              </button>
            </div>
          </div>
        )}

        {resolving && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="text-[12px] font-medium text-emerald-800">Resolution note (required)</div>
            <textarea
              rows={3}
              value={note}
              maxLength={2000}
              onChange={(e) => { setNote(e.target.value); setError(""); }}
              placeholder="What was done, e.g. talked to the driver and called the store to apologize"
              className={`${fieldCls} text-[13px] resize-y`}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy === "resolve"} onClick={resolve} title="Resolve the ticket with this note; the customer sees it" className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50">
                Resolve ticket
              </button>
              <button type="button" data-no-confirm onClick={() => { setResolving(false); setNote(""); setError(""); }} title="Go back without resolving" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t border-black/[0.06]">
          {t.status === "open" && (
            <button type="button" disabled={busy === "progress"} onClick={() => run("progress", `/api/support-messages/${id}`, "PATCH", { status: "in_progress" }, "Ticket marked in progress.")} title="Show the customer that someone is working on it" className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Mark in progress
            </button>
          )}
          {active && !resolving && (
            <button type="button" data-no-confirm onClick={() => { setResolving(true); setError(""); }} title="Write a resolution note, then resolve the ticket" className="mt-3 ml-auto px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer">
              Resolve with note
            </button>
          )}
          {t.status === "resolved" && (
            <button type="button" disabled={busy === "close"} onClick={() => run("close", `/api/support-messages/${id}/close`, "PATCH", null, "Ticket closed.")} title="File the resolved ticket away" className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Close ticket
            </button>
          )}
          {!active && (
            <button type="button" disabled={busy === "reopen"} onClick={() => run("reopen", `/api/support-messages/${id}/reopen`, "PATCH", null, "Ticket reopened.")} title="Open the ticket again; the resolution note is cleared" className="mt-3 ml-auto px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupportInboxPage() {
  const [filter, setFilter] = useState("active");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [all, setAll] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [overdueHours, setOverdueHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/support-messages", { headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not load tickets (${res.status})`);
      const data = await res.json();
      setAll(data.messages || []);
      setAssignees(data.assignees || []);
      if (data.overdue_hours) setOverdueHours(data.overdue_hours);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["support"]);
  useEffect(() => {
    load();
  }, [load, live]);

  const now = Date.now();
  const isOverdue = useCallback((t) => isActive(t) && now - new Date(t.created_at) > overdueHours * 3600000, [now, overdueHours]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0, overdue: 0, active: 0 };
    all.forEach((t) => {
      c[t.status] = (c[t.status] || 0) + 1;
      if (isActive(t)) c.active += 1;
      if (isOverdue(t)) c.overdue += 1;
    });
    return c;
  }, [all, isOverdue]);

  const weekAgo = now - 7 * 86400000;
  const resolvedWeek = all.filter((t) => t.resolved_at && new Date(t.resolved_at) >= weekAgo);
  const avgHours = resolvedWeek.length
    ? Math.round(resolvedWeek.reduce((s, t) => s + (new Date(t.resolved_at) - new Date(t.created_at)), 0) / resolvedWeek.length / 3600000)
    : null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((t) => {
        if (filter === "active") return isActive(t);
        if (filter === "overdue") return isOverdue(t);
        if (filter === "all") return true;
        return t.status === filter;
      })
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => !q || [t.ticket_no, t.customer?.name, t.topic_label].some((v) => (v || "").toLowerCase().includes(q)))
      // active tickets: highest priority first, then oldest first; others newest first
      .sort((a, b) =>
        isActive(a) && isActive(b)
          ? (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || new Date(a.created_at) - new Date(b.created_at)
          : isActive(b) - isActive(a) || new Date(b.created_at) - new Date(a.created_at)
      );
  }, [all, filter, priority, search, isOverdue]);

  const pager = usePagination(rows);

  const topics = useMemo(() => {
    const map = new Map();
    all.forEach((t) => map.set(t.topic_label || "Other", (map.get(t.topic_label || "Other") || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count], i) => ({ label, count, tone: TOPIC_TONES[i % TOPIC_TONES.length] }));
  }, [all]);

  const oldest = all.filter(isActive).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];

  const STATUS_FILTERS = [
    { value: "active", label: "Open and in progress", count: counts.active },
    { value: "open", label: "Open", count: counts.open },
    { value: "in_progress", label: "In progress", count: counts.in_progress },
    { value: "overdue", label: "Overdue", count: counts.overdue },
    { value: "resolved", label: "Resolved", count: counts.resolved },
    { value: "closed", label: "Closed", count: counts.closed },
    { value: "all", label: "All", count: all.length },
  ];

  return (
    <AdminLayout pageTitle="Support Tickets" breadcrumb="CRM / Support Tickets">
      <KpiGrid cols={4}>
        <KpiCard label="Open" icon="message" tone="amber" value={counts.open} sub="Not handled yet" bar={all.length ? counts.open / all.length : 0} onClick={() => setFilter("open")} active={filter === "open"} live={counts.open > 0} />
        <KpiCard label="In progress" icon="clock" tone="cyan" value={counts.in_progress} sub="Being worked on" onClick={() => setFilter("in_progress")} active={filter === "in_progress"} />
        <KpiCard label="Overdue" icon="alert" tone="rose" value={counts.overdue} sub={`Waiting over ${overdueHours} hours`} onClick={() => setFilter("overdue")} active={filter === "overdue"} live={counts.overdue > 0} />
        <KpiCard label="Resolved this week" icon="check" tone="emerald" value={resolvedWeek.length} sub={avgHours == null ? "None in the last 7 days" : `Average ${avgHours}h to resolve`} onClick={() => setFilter("resolved")} active={filter === "resolved"} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 min-w-0 bg-white border border-black/[0.09] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <div className="text-[13px] font-semibold text-slate-800">Tickets</div>
              <div className="text-[11px] text-slate-400 mt-0.5">From the customer portal's Contact Support page. Pick a ticket to open it.</div>
            </div>
            <FilterSelect label="Status" value={filter} onChange={setFilter} options={STATUS_FILTERS} />
            <FilterSelect
              label="Priority"
              value={priority}
              onChange={setPriority}
              options={[{ value: "all", label: "All", count: all.filter(isActive).length }, ...Object.entries(PRIORITY).map(([k, p]) => ({ value: k, label: p.label, count: all.filter((t) => t.priority === k && isActive(t)).length }))]}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket no. or customer"
              className="w-full sm:w-56 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:border-cyan-500/60"
            />
          </div>

          {error && <div className="px-5 py-3 text-[12px] text-red-600 bg-red-50 border-b border-red-200">{error}</div>}

          {loading ? (
            <SkeletonList />
          ) : rows.length === 0 ? (
            <EmptyState icon="bell" title={filter === "active" ? "No open tickets" : "No tickets here"}>
              {filter === "active" ? "Every customer ticket has been handled. New ones show up here right away." : "Pick another status or clear the search to see other tickets."}
            </EmptyState>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
                      <th className="px-[18px] py-2.5 font-medium">Ticket no.</th>
                      <th className="px-[18px] py-2.5 font-medium">Customer</th>
                      <th className="px-[18px] py-2.5 font-medium">Category</th>
                      <th className="px-[18px] py-2.5 font-medium">Priority</th>
                      <th className="px-[18px] py-2.5 font-medium">Status</th>
                      <th className="px-[18px] py-2.5 font-medium">Assigned to</th>
                      <th className="px-[18px] py-2.5 font-medium text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.pageItems.map((t) => {
                      const overdue = isOverdue(t);
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelected(t.id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(t.id))}
                          tabIndex={0}
                          aria-selected={selected === t.id}
                          className={`border-t border-black/[0.06] cursor-pointer hover:bg-slate-50 ${selected === t.id ? "bg-cyan-50/60" : ""}`}
                        >
                          <td className="px-[18px] py-2.5 font-mono text-[12px] text-slate-700 whitespace-nowrap">{t.ticket_no}</td>
                          <td className="px-[18px] py-2.5 text-slate-800">{t.customer?.name || "Customer"}</td>
                          <td className="px-[18px] py-2.5 text-slate-600">{t.topic_label}</td>
                          <td className="px-[18px] py-2.5"><Pill map={PRIORITY} value={t.priority} /></td>
                          <td className="px-[18px] py-2.5"><Pill map={STATUS} value={t.status} /></td>
                          <td className="px-[18px] py-2.5 text-slate-600">{t.assignee?.name || <span className="text-slate-400">Nobody yet</span>}</td>
                          <td className={`px-[18px] py-2.5 text-right whitespace-nowrap ${overdue ? "text-rose-700 font-semibold" : "text-slate-500"}`} title={formatDateTime(t.created_at)}>
                            {age(t.created_at, isActive(t) ? now : new Date(t.resolved_at || t.updated_at).getTime())}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination pager={pager} label="tickets" />
            </>
          )}
        </div>

        <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0">
          {selected ? (
            <TicketPanel id={selected} assignees={assignees} overdueHours={overdueHours} onChanged={load} onClose={() => setSelected(null)} />
          ) : (
            <>
              <StatusBreakdown title="Tickets by category" items={topics} empty="No customer tickets yet." />
              <ActivityFeed
                title="Latest tickets"
                items={all.map((t) => ({
                  id: t.id,
                  title: `${t.ticket_no} · ${t.customer?.name || "Customer"}`,
                  meta: `${t.topic_label || "Ticket"} · ${STATUS[t.status]?.label || t.status}`,
                  when: formatDateTime(t.created_at, { year: false }),
                  tone: isActive(t) ? "amber" : "emerald",
                  icon: "message",
                }))}
                empty="Tickets from customers will be listed here."
              />
              <TipsWidget tips={[
                ...(oldest ? [{ title: `Oldest open ticket: ${age(oldest.created_at)}`, text: `${oldest.ticket_no} from ${oldest.customer?.name || "a customer"} is waiting.`, tone: "amber", icon: "clock" }] : []),
                { title: "Close the loop", text: "Reply to the customer, then resolve the ticket with a note of what was done. The customer sees both in their portal.", tone: "emerald", icon: "check" },
              ]} />
            </>
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
