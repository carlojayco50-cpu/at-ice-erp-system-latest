import { useCallback, useEffect, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import MessageBubble from "../../components/MessageBubble";
import { COMPANY, CYAN_BUTTON, ICE_CARD, ICE_INSET, SUPPORT_TOPICS } from "../../lib/company";
import { toList } from "../../lib/list";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";

const authHeaders = (extra = {}) => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  ...extra,
});

const SendIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const PhoneIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const MailIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>;
const ShieldIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
const CheckIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>;
const PinIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;

// A ticket's status as the customer sees it (Admin's Support Tickets sets it).
const TICKET_STATUS = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "In progress", cls: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const ACTIVE = ["open", "in_progress"];

const fieldCls =
  "w-full bg-white border border-black/[0.12] rounded-xl px-3.5 py-2.5 text-[13px] text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition";


// Add to an open or in-progress ticket instead of opening a new one.
function TicketReply({ ticket, onSent }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    if (body.trim().length < 2) {
      setError("Write your reply first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/my-support-messages/${ticket.id}/replies`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Please wait a minute before sending another reply.");
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Your reply could not be sent.");
      setBody("");
      toast.success(`Reply added to ${ticket.ticket_no}.`);
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <textarea
        rows={2}
        value={body}
        maxLength={2000}
        onChange={(e) => { setBody(e.target.value); setError(""); }}
        placeholder="Add more details to this ticket"
        className={`${fieldCls} resize-y`}
      />
      {error && <div className="text-[12px] text-red-700">{error}</div>}
      <div>
        <button type="button" disabled={busy} onClick={send} title="Add this reply to the ticket; the dispatch room sees it" className={`${CYAN_BUTTON} disabled:opacity-50`}>
          <SendIcon />
          {busy ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
}

export default function CustomerSupport() {
  // An unsent message survives a refresh.
  const draft = useDraft("support:new", { topic: SUPPORT_TOPICS[0].key, message: "" });
  const { topic, message } = draft.values;
  const { topic: setTopic } = draft.set;
  const setMessage = draft.set.message;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [branch, setBranch] = useState("");
  const [history, setHistory] = useState([]);

  // one open ticket per topic (Emergency Ice Shortage is never blocked): point
  // the customer to the ticket they already have instead
  const openSame = topic === "emergency_supply"
    ? null
    : history.find((m) => m.topic === topic && ACTIVE.includes(m.status));

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/my-support-messages", { headers: authHeaders() });
      if (res.ok) setHistory(toList(await res.json()));
    } catch {
      // the form still works without the history list
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["support"]);
  useEffect(() => {
    fetch("/api/my-profile", { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => p?.name && setBranch(p.name))
      .catch(() => {});
    loadHistory();
  }, [loadHistory, live]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSent("");
    if (message.trim().length < 5) {
      setError("Please describe your concern in a few words.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/my-support-messages", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ topic, message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("You have sent several tickets just now. Please wait a few minutes, or add to an open ticket with Reply.");
      if (!res.ok) {
        const firstFieldError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(firstFieldError || data.message || "Your message could not be sent.");
      }
      draft.clear();
      toast.success(data.ticket_no ? `Ticket ${data.ticket_no} created.` : "Your ticket was sent.");
      setSent(`${data.ticket_no ? `Ticket ${data.ticket_no}` : "Your ticket"} was sent to the dispatch room. The answer will show under Your Tickets.`);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <CustomerLayout pageTitle="Contact Support" breadcrumb="Support">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* Message form */}
          <form onSubmit={submit} className={`${ICE_CARD} p-6 sm:p-7 flex flex-col gap-5`}>
            <DraftHint draft={draft} />
            <div>
              <h2 className="text-[17px] font-bold text-slate-800">Open a Support Ticket</h2>
              <p className="text-[12px] text-slate-500 mt-1">
                The plant dispatch room receives your ticket right away and answers it here.
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">Inquiry Topic</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${fieldCls} cursor-pointer`}>
                {SUPPORT_TOPICS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              {openSame && (
                <span className="text-[12px] text-amber-700">
                  You already have an open ticket about this ({openSame.ticket_no}). Add to it with Reply under Your Tickets.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">Message / Details</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={`Describe your concern or schedule request${branch ? ` for ${branch}` : ""}`}
                className={`${fieldCls} resize-y min-h-[96px]`}
              />
            </label>

            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>
            )}
            {sent && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700">{sent}</div>
            )}

            <div>
              <button type="submit" disabled={sending || !!openSame} className={`${CYAN_BUTTON} disabled:opacity-50`}>
                <SendIcon />
                {sending ? "Sending…" : "Submit ticket"}
              </button>
            </div>
          </form>

          {/* Your tickets: one card each, with its number, topic and status on
              top, then the conversation, then the resolution once resolved */}
          {history.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="px-1 text-[13px] font-semibold text-slate-800">
                Your Tickets <span className="text-slate-400 font-normal">· {history.length}</span>
              </div>
              {history.map((m) => {
                const s = TICKET_STATUS[m.status] || TICKET_STATUS.open;
                return (
                  <div key={m.id} className={`${ICE_CARD} overflow-hidden`}>
                    <div className="px-5 py-3 border-b border-black/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1">
                      {m.ticket_no && <span className="font-mono text-[12px] font-semibold text-slate-800">{m.ticket_no}</span>}
                      <span className="text-[13px] text-slate-700">{m.topic_label}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.cls}`}>{s.label}</span>
                      <span className="w-full text-[11px] text-slate-400">Sent {formatDateTime(m.created_at)}</span>
                    </div>
                    <div className="px-5 py-4 flex flex-col gap-3">
                      <MessageBubble mine from="You" at={m.created_at}>
                        {m.message}
                      </MessageBubble>
                      {(m.replies || []).map((r) =>
                        r.kind === "customer" ? (
                          <MessageBubble key={r.id} mine from="You" at={r.created_at}>
                            {r.body}
                          </MessageBubble>
                        ) : (
                          <MessageBubble key={r.id} from={`${COMPANY.name} Support`} at={r.created_at}>
                            {r.body}
                          </MessageBubble>
                        )
                      )}
                      {!m.replies?.some((r) => r.kind === "reply") && !m.resolution_note && (
                        <div className="text-[12px] text-slate-400">No reply yet. The dispatch room will answer here.</div>
                      )}
                      {ACTIVE.includes(m.status) && <TicketReply ticket={m} onSent={loadHistory} />}
                      {m.resolution_note && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-800">
                            <CheckIcon /> Resolved{m.resolved_at ? ` · ${formatDateTime(m.resolved_at)}` : ""}
                          </div>
                          <div className="mt-1 text-[13px] text-emerald-900 whitespace-pre-line break-words">{m.resolution_note}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side cards */}
        <div className="flex flex-col gap-5">
          <div className={`${ICE_CARD} p-6`}>
            <div className="text-[12px] font-semibold tracking-wider uppercase text-cyan-600">Immediate Hotlines</div>
            <div className="flex flex-col gap-3 mt-4">
              <a href={COMPANY.hotlineHref} className={`${ICE_INSET} block px-4 py-3.5 hover:border-cyan-500/40 transition-colors`}>
                <div className="flex items-center gap-2 text-[12px] text-slate-700"><PhoneIcon /> Mobile Dispatcher Hotline</div>
                <div className="text-[16px] font-semibold font-mono text-cyan-600 mt-1.5">{COMPANY.hotline}</div>
                <div className="text-[11px] text-slate-500 mt-1">Direct line to the on-duty supervisor</div>
              </a>
              <a href={`mailto:${COMPANY.email}`} className={`${ICE_INSET} block px-4 py-3.5 hover:border-cyan-500/40 transition-colors`}>
                <div className="flex items-center gap-2 text-[12px] text-slate-700"><MailIcon /> Email</div>
                <div className="text-[13px] font-mono text-cyan-600 mt-1.5 break-all">{COMPANY.email}</div>
              </a>
            </div>
          </div>

          <div className={`${ICE_CARD} p-6`}>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
              <span className="text-cyan-600"><ShieldIcon /></span> {COMPANY.name}
            </div>
            <p className="text-[12px] text-slate-600 mt-3 leading-relaxed">{COMPANY.sister}</p>
            <div className="flex items-start gap-2 text-[12px] text-slate-500 mt-4 pt-4 border-t border-black/[0.06]">
              <span className="text-cyan-600 mt-0.5 flex-shrink-0"><PinIcon /></span>
              {COMPANY.address}
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
