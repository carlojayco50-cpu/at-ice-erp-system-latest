import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import MessageBubble from "../../components/MessageBubble";
import { formatDateTime } from "../../lib/time";

// Dispatch room inbox: messages customers send from Contact Support.
// Only the Admin receives them.

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const fmtDateTime = (s) =>
  s ? formatDateTime(s) : "";

export default function SupportInboxPage() {
  const [filter, setFilter] = useState("open");
  const [messages, setMessages] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/support-messages${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not load messages (${res.status})`);
      const data = await res.json();
      setMessages(data.messages || []);
      setOpenCount(data.open_count || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["support"]);
  useEffect(() => {
    load();
  }, [load, live]);

  const setStatus = async (m, action) => {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/support-messages/${m.id}/${action}`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not update the message (${res.status})`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout pageTitle="Support Inbox" breadcrumb="CRM / Support Inbox">
      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <div className="text-[13px] font-semibold text-slate-800">Customer Messages</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Sent from the customer portal's Contact Support page. {openCount} open.
            </div>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-md p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={`px-3 py-1 rounded text-[12px] cursor-pointer ${filter === f.key ? "bg-white text-slate-800 font-medium shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="px-5 py-3 text-[12px] text-red-600 bg-red-50 border-b border-red-200">{error}</div>}

        {loading ? (
          <SkeletonList />
        ) : messages.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12px] text-slate-400">No {filter === "all" ? "" : filter} messages.</div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {messages.map((m) => (
              // compact card: the message (avatar, name, badges, bubble, details)
              // with its action right beside it, no wide gap across the page
              <div key={m.id} className="support-card px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 w-full sm:w-auto sm:max-w-[640px]">
                  <MessageBubble
                    from={m.customer?.name || "Customer"}
                    role="Customer"
                    at={m.created_at}
                    tag={
                      <>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">{m.topic_label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${m.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {m.status === "resolved" ? "Resolved" : "Open"}
                        </span>
                      </>
                    }
                    footer={
                      <>
                        {m.customer?.contact_person && <span>Contact: {m.customer.contact_person}</span>}
                        {m.customer?.contact_number && <span>{m.customer.contact_number}</span>}
                        {m.status === "resolved" && <span>Resolved by {m.resolver?.name || "Admin"} on {fmtDateTime(m.resolved_at)}</span>}
                      </>
                    }
                  >
                    {m.message}
                  </MessageBubble>
                </div>
                <button
                  disabled={busyId === m.id}
                  onClick={() => setStatus(m, m.status === "resolved" ? "reopen" : "resolve")}
                  className={`flex-shrink-0 self-center px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50 ${
                    m.status === "resolved"
                      ? "border border-black/[0.09] text-slate-600 hover:bg-slate-50"
                      : "bg-cyan-500 hover:bg-cyan-600 text-white"
                  }`}
                >
                  {m.status === "resolved" ? "Reopen" : "Mark Resolved"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
