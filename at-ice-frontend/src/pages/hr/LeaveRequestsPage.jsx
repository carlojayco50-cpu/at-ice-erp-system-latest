// src/pages/hr/LeaveRequestsPage.jsx
//
// HR Leave Requests. Employees file their own leave (/my-leave); HR only
// approves or rejects here (docs/REVIEW-DECISIONS.md):
//   Approve  optional remarks. The days are paid from the employee's leave
//            credits as far as they go, the rest is unpaid. A sick leave can be
//            marked unpaid.
//   Reject   a reason is required.
// Every decision is written to the audit log. The list follows the live feed.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { openProtectedFile } from "../../lib/openFile";
import EmptyState from "../../components/EmptyState";
import MessageBubble from "../../components/MessageBubble";
import { formatDateTime } from "../../lib/time";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import FilterSelect from "../../components/FilterSelect";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { ActivityFeed, StatusBreakdown, TipsWidget } from "../../components/Insight";
import { Icon } from "../../components/icons";

const SearchIcon = () => <Icon name="search" size={13} />;
const XIcon = () => <Icon name="x" size={16} />;

const token = () => localStorage.getItem("token") || "";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(firstError || data?.message || `Request failed (${res.status}).`);
  }
  return data;
}

const toList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
const TYPE_LABEL = { sick: "Sick (SL)", vacation: "Vacation (VL)", emergency: "Emergency (EL)", maternity: "Maternity", paternity: "Paternity", other: "Other" };
const typeLabel = (v) => TYPE_LABEL[v] || v || "—";
const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_CLASS = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-600" };
const TABS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]];

const empName = (e) => (e ? [e.first_name, e.middle_initial ? `${e.middle_initial}.` : "", e.last_name, e.suffix].filter(Boolean).join(" ") : "—");
const empCode = (e) => (typeof e?.employee_id === "string" ? e.employee_id : "");
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");
const fmtDateTime = (d) => (d ? formatDateTime(d) : "—");
const num = (n) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""); };
const length = (l) => (l.hours ? `${num(l.hours)} h` : l.is_half_day ? "0.5 day" : `${num(l.total_days)} day${Number(l.total_days) === 1 ? "" : "s"}`);
const dates = (l) => (String(l.start_date).slice(0, 10) === String(l.end_date).slice(0, 10) ? fmtDate(l.start_date) : `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)}`);
const decidedBy = (l) => (l.approved_by && typeof l.approved_by === "object" ? l.approved_by.name : null) || "HR";
const payLabel = (l) => (l.status !== "approved" ? "" : l.is_paid ? "Paid" : Number(l.paid_days) > 0 ? `${num(l.paid_days)} paid · ${num(l.unpaid_days)} unpaid` : "Unpaid");

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="bg-white rounded-xl border border-black/[0.09] w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div className="text-[14px] font-semibold text-slate-800">{title}</div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"><XIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function LeaveRequestsPage() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");

  // Approve/Reject modal: reopens after a refresh with what was typed.
  const decisionDraft = useDraft("leave:decision", { decision: null, remarks: "", rejectReason: "", slPaid: true }, { when: (v) => !!v.decision });
  const { decision, remarks, rejectReason, slPaid } = decisionDraft.values; // decision: { leave, status }
  const { decision: setDecision, remarks: setRemarks, rejectReason: setRejectReason, slPaid: setSlPaid } = decisionDraft.set;
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [viewing, setViewing] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLeaves(toList(await api("/api/leave-requests")));
    } catch (e) {
      setError(e.message || "Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["leave"]);
  useEffect(() => { fetchAll(); }, [fetchAll, live]);

  // Opened from the HR Dashboard (?view=<id>)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("view");
    if (!id || loading) return;
    const found = leaves.find((l) => String(l.id) === id);
    if (found) {
      setTab(found.status === "pending" ? "pending" : "all");
      setViewing(found);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, loading, leaves]);

  const counts = useMemo(() => {
    const c = { all: leaves.length, pending: 0, approved: 0, rejected: 0 };
    leaves.forEach((l) => { if (c[l.status] !== undefined) c[l.status] += 1; });
    return c;
  }, [leaves]);

  // Employee ID first, then name or type
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leaves
      .filter((l) => tab === "all" || l.status === tab)
      .map((l) => [l, !q ? 1 : empCode(l.employee).toLowerCase().includes(q) ? 2 : (empName(l.employee).toLowerCase().includes(q) || typeLabel(l.leave_type).toLowerCase().includes(q)) ? 1 : 0])
      .filter(([, r]) => r > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l);
  }, [leaves, tab, search]);

  const openDecision = (leave, status) => {
    setDecision({ leave, status });
    setRemarks("");
    setRejectReason("");
    setSlPaid(true);
    setDecisionError("");
  };

  const submitDecision = async () => {
    if (!decision) return;
    if (decision.status === "rejected" && rejectReason.trim().length < 3) {
      setDecisionError("Give the reason for rejecting this leave.");
      return;
    }
    setDeciding(true);
    setDecisionError("");
    try {
      const body = decision.status === "rejected"
        ? { status: "rejected", reject_reason: rejectReason.trim() }
        : { status: "approved", remarks: remarks.trim() || null, ...(decision.leave.leave_type === "sick" ? { is_paid: slPaid } : {}) };
      await api(`/api/leave-requests/${decision.leave.id}/status`, { method: "PUT", body: JSON.stringify(body) });
      toast.success(`Leave of ${empName(decision.leave.employee)} was ${decision.status}.`);
      setDecision(null);
      await fetchAll();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setDeciding(false);
    }
  };

  const dl = decision?.leave;
  const credit = dl?.credits?.available ?? 0;
  const dlDays = dl ? Number(dl.total_days) : 0; // EL is already in days (hours ÷ hours per day)

  const pager = usePagination(filtered);

  // Summary for the KPI cards and side panels
  const share = (n) => (leaves.length ? n / leaves.length : 0);
  const todayKey = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const onLeaveToday = leaves.filter((l) => l.status === "approved" && String(l.start_date).slice(0, 10) <= todayKey && String(l.end_date || l.start_date).slice(0, 10) >= todayKey).length;
  const TYPE_TONES = ["rose", "cyan", "amber", "violet", "emerald", "slate"];
  const byType = Object.entries(TYPE_LABEL).map(([k, label], i) => ({ label, count: leaves.filter((l) => l.leave_type === k).length, tone: TYPE_TONES[i % TYPE_TONES.length] })).filter((t) => t.count > 0);
  const recent = [...leaves].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .map((l) => ({ id: l.id, title: empName(l.employee), meta: `${typeLabel(l.leave_type)} · ${STATUS_LABEL[l.status] || l.status} · ${length(l)}`, when: fmtDate(l.start_date), tone: { pending: "amber", approved: "emerald", rejected: "rose" }[l.status] || "slate", icon: "calendar" }));

  return (
    <HrLayout pageTitle="Leave Requests" breadcrumb="HRIS / Leave Requests">
      <KpiGrid cols={5}>
        <KpiCard label="To review" icon="clock" tone="amber" value={counts.pending} sub="Waiting for your decision" bar={share(counts.pending)} onClick={() => setTab("pending")} active={tab === "pending"} live={counts.pending > 0} />
        <KpiCard label="Approved" icon="check" tone="emerald" value={counts.approved} sub={`${Math.round(share(counts.approved) * 100)}% of requests`} bar={share(counts.approved)} onClick={() => setTab("approved")} active={tab === "approved"} />
        <KpiCard label="Rejected" icon="x" tone="rose" value={counts.rejected} sub="With a reason given" bar={share(counts.rejected)} onClick={() => setTab("rejected")} active={tab === "rejected"} />
        <KpiCard label="On leave today" icon="calendar" tone="violet" value={onLeaveToday} sub="Approved leave covering today" />
        <KpiCard label="All requests" icon="file" tone="cyan" value={counts.all} sub="Filed by employees" onClick={() => setTab("all")} active={tab === "all"} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <div className="xl:col-span-8 min-w-0">
      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">Leave Requests</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Filed by employees from their own page. Approve or reject them here.</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md text-slate-400 w-full sm:w-64">
            <SearchIcon />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee ID, name or type"
              aria-label="Search by employee ID, name or leave type" className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent focus:outline-none" />
          </div>
        </div>

        <div className="px-[18px] pt-3">
          <FilterSelect label="Status" value={tab} onChange={setTab}
            options={TABS.map(([key, label]) => ({ value: key, label, count: loading ? null : counts[key] }))} />
        </div>

        <div className="mt-3 border-t border-black/[0.09]">
          {loading ? (
            <SkeletonList />
          ) : error ? (
            <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
          ) : leaves.length === 0 ? (
            <EmptyState icon="calendar">No leave requests yet. Employees file them from their own Leave Request page.</EmptyState>
          ) : filtered.length === 0 ? (
            <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No leave request matches.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                    <th className="px-[18px] py-2.5 font-medium">Employee ID</th>
                    <th className="px-[18px] py-2.5 font-medium">Name</th>
                    <th className="px-[18px] py-2.5 font-medium">Type</th>
                    <th className="px-[18px] py-2.5 font-medium">Dates</th>
                    <th className="px-[18px] py-2.5 font-medium">Length</th>
                    <th className="px-[18px] py-2.5 font-medium">Credits left</th>
                    <th className="px-[18px] py-2.5 font-medium">Status</th>
                    <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map((l) => (
                    <tr key={l.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                      <td className="px-[18px] py-2.5 font-mono text-slate-600">{empCode(l.employee) || "—"}</td>
                      <td className="px-[18px] py-2.5 text-slate-800 font-medium whitespace-nowrap">{empName(l.employee)}</td>
                      <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">
                        {typeLabel(l.leave_type)}
                        {l.attachment_path && <span className="ml-1.5 px-1.5 py-px rounded bg-violet-50 border border-violet-200 text-[9px] font-bold text-violet-700">{l.leave_type === "sick" ? "MED CERT" : "FILE"}</span>}
                      </td>
                      <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">{dates(l)}</td>
                      <td className="px-[18px] py-2.5 text-slate-600 font-mono whitespace-nowrap">{length(l)}</td>
                      <td className="px-[18px] py-2.5 text-slate-600 font-mono">{l.credits ? num(l.credits.available) : "—"}</td>
                      <td className="px-[18px] py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLASS[l.status] || "bg-slate-100 text-slate-500"}`}>{STATUS_LABEL[l.status] || l.status}</span>
                        {payLabel(l) && <div className="text-[10px] text-slate-400 mt-0.5">{payLabel(l)}</div>}
                      </td>
                      <td className="px-[18px] py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setViewing(l)} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer">View</button>
                          {l.status === "pending" && (
                            <>
                              <button data-no-confirm onClick={() => openDecision(l, "approved")} className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 rounded-md text-[11px] font-semibold text-white cursor-pointer">Approve</button>
                              <button data-no-confirm onClick={() => openDecision(l, "rejected")} className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-[11px] font-semibold cursor-pointer">Reject</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pager={pager} />
            </div>
          )}
        </div>
      </div>
      </div>
      <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0">
        <StatusBreakdown title="Requests by type" items={byType} empty="No leave requests yet." />
        <ActivityFeed title="Latest requests" items={recent} empty="Requests employees file show up here." max={5} />
        <TipsWidget tips={[
          { title: "Sick leave needs a med cert", text: "SL is filed at most 1 day after returning; check the medical certificate before approving.", tone: "rose", icon: "file" },
          { title: "Credits are paid first", text: "Approved days are paid from the employee's credits; the rest are unpaid and feed payroll.", tone: "cyan", icon: "wallet" },
          { title: "A reason is required to reject", text: "The employee sees it on their Leave Request page.", tone: "amber", icon: "message" },
        ]} />
      </aside>
      </div>

      {/* APPROVE / REJECT */}
      {decision && (
        <Modal title={decision.status === "approved" ? "Approve leave" : "Reject leave"} onClose={() => !deciding && setDecision(null)}>
          <div className="p-5 flex flex-col gap-3 text-xs">
            <DraftHint draft={decisionDraft} />
            <div className="text-slate-700">
              <b>{empName(dl.employee)}</b> <span className="font-mono text-slate-400">{empCode(dl.employee)}</span> · {typeLabel(dl.leave_type)} · {dates(dl)} · {length(dl)}
            </div>
            {dl.attachment_path && (
              <button type="button" onClick={() => openProtectedFile(`/api/leave-requests/${dl.id}/attachment`, "attachment")} className="self-start text-cyan-600 font-semibold cursor-pointer">
                {dl.leave_type === "sick" ? "View medical certificate" : "View attachment"}
              </button>
            )}
            {decision.status === "approved" ? (
              <>
                <p className={`px-3 py-2 rounded-lg border ${credit >= dlDays ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  {num(credit)} day(s) of leave credits left. {credit >= dlDays ? "This leave will be paid from them." : `${num(Math.max(0, dlDays - credit))} day(s) will be unpaid and deducted in payroll.`}
                </p>
                {dl.leave_type === "sick" && (
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" data-native checked={slPaid} onChange={(e) => setSlPaid(e.target.checked)} />
                    Paid sick leave (uncheck to approve it as unpaid)
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Remarks (optional)</span>
                  <textarea rows={2} maxLength={300} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="px-2.5 py-2 border border-black/[0.09] rounded-md text-xs" />
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Reason for rejecting (required)</span>
                <textarea rows={3} maxLength={300} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="px-2.5 py-2 border border-black/[0.09] rounded-md text-xs" autoFocus />
              </label>
            )}
            {decisionError && <div role="alert" className="text-red-600">{decisionError}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setDecision(null)} disabled={deciding} className="px-3.5 py-1.5 text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
              <button onClick={submitDecision} disabled={deciding || (decision.status === "rejected" && rejectReason.trim().length < 3)}
                className={`px-3.5 py-1.5 rounded-md text-white font-semibold disabled:opacity-50 cursor-pointer ${decision.status === "approved" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"}`}>
                {deciding ? "Saving…" : decision.status === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DETAILS */}
      {viewing && (
        <Modal title="Leave request" onClose={() => setViewing(null)}>
          <div className="p-5 flex flex-col gap-2.5 text-xs">
            {[
              ["Employee", `${empName(viewing.employee)} (${empCode(viewing.employee) || "—"})`],
              ["Type", typeLabel(viewing.leave_type)],
              ["Dates", dates(viewing)],
              ["Length", length(viewing)],
              ["Status", `${STATUS_LABEL[viewing.status] || viewing.status}${payLabel(viewing) ? ` · ${payLabel(viewing)}` : ""}`],
              ["Credits left", viewing.credits ? `${num(viewing.credits.available)} day(s)` : "—"],
              ["Filed", fmtDateTime(viewing.created_at)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-1 border-b border-black/[0.06]">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700">{value}</span>
              </div>
            ))}
            {viewing.attachment_path && (
              <button type="button" onClick={() => openProtectedFile(`/api/leave-requests/${viewing.id}/attachment`, "attachment")} className="self-start text-cyan-600 font-semibold cursor-pointer">
                {viewing.leave_type === "sick" ? "View medical certificate" : "View attachment"}
              </button>
            )}
            <div className="flex flex-col gap-2.5 mt-1">
              <MessageBubble from={empName(viewing.employee)} role="Reason" at={viewing.created_at}>{viewing.reason}</MessageBubble>
              {viewing.reject_reason && <MessageBubble mine from={decidedBy(viewing)} role="Reason for rejection" at={viewing.approved_at}>{viewing.reject_reason}</MessageBubble>}
              {viewing.admin_notes && <MessageBubble mine from={decidedBy(viewing)} role="HR remarks" at={viewing.approved_at}>{viewing.admin_notes}</MessageBubble>}
            </div>
          </div>
        </Modal>
      )}
    </HrLayout>
  );
}
