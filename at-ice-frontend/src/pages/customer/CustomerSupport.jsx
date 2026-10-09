import { useCallback, useEffect, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import MessageBubble from "../../components/MessageBubble";
import { COMPANY, CYAN_BUTTON, ICE_CARD, ICE_INSET, SUPPORT_TOPICS } from "../../lib/company";
import { toList } from "../../lib/list";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";

const authHeaders = (extra = {}) => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  ...extra,
});

const SendIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const PhoneIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const MailIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>;
const ShieldIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
const PinIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;

const fieldCls =
  "w-full bg-white border border-black/[0.12] rounded-xl px-3.5 py-2.5 text-[13px] text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition";


export default function CustomerSupport() {
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0].key);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [branch, setBranch] = useState("");
  const [history, setHistory] = useState([]);

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
      if (!res.ok) {
        const firstFieldError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(firstFieldError || data.message || "Your message could not be sent.");
      }
      setMessage("");
      toast.success("Your message was sent.");
      setSent("Sent to the dispatch room. The supervisor on duty will get back to you.");
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
            <div>
              <h2 className="text-[17px] font-bold text-slate-800">Send Direct Message to Dispatch Room</h2>
              <p className="text-[12px] text-slate-500 mt-1">
                The plant dispatch supervisor receives your inquiry right away.
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">Inquiry Topic</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${fieldCls} cursor-pointer`}>
                {SUPPORT_TOPICS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
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
              <button type="submit" disabled={sending} className={CYAN_BUTTON}>
                <SendIcon />
                {sending ? "Sending…" : "Send to Dispatch"}
              </button>
            </div>
          </form>

          {/* Sent messages */}
          {history.length > 0 && (
            <div className={`${ICE_CARD} overflow-hidden`}>
              <div className="px-6 py-4 border-b border-black/[0.06] text-[13px] font-semibold text-slate-800">
                Your Recent Messages
              </div>
              <div className="px-6 py-4 flex flex-col gap-4">
                {history.map((m) => (
                  <MessageBubble
                    key={m.id}
                    mine
                    from="You"
                    role={m.topic_label}
                    at={m.created_at}
                    footer={
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        m.status === "resolved"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {m.status === "resolved" ? "Resolved" : "Open"}
                      </span>
                    }
                  >
                    {m.message}
                  </MessageBubble>
                ))}
              </div>
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
