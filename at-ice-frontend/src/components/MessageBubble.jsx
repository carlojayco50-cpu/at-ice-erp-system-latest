import { initialsOf } from "../lib/initials";

// One look for every written message in the system (support messages, leave
// reasons, HR notes): a chat bubble with the sender's initials, name and time,
// so it reads as a message at a glance. `mine` puts it on the right in cyan
// (sent by the person viewing); otherwise it is on the left in grey.
const fmtWhen = (v) =>
  v ? new Date(v).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function MessageBubble({ from, role, at, mine = false, tag, children, footer, className = "" }) {
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${className}`}>
      <div
        aria-hidden="true"
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold ${
          mine ? "bg-cyan-500 text-white" : "bg-slate-600 text-white"
        }`}
      >
        {initialsOf(from, "?")}
      </div>
      <div className={`min-w-0 max-w-[85%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
        <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-1 text-[11px] ${mine ? "justify-end" : ""}`}>
          <span className="font-semibold text-slate-700">{from || "Unknown"}</span>
          {role && <span className="text-slate-400">· {role}</span>}
          {tag}
        </div>
        <div
          className={`px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line break-words shadow-sm ${
            mine
              ? "bg-cyan-500 text-white rounded-2xl rounded-br-md"
              : "bg-white text-slate-800 border border-black/[0.09] rounded-2xl rounded-bl-md"
          }`}
        >
          {children}
        </div>
        {(at || footer) && (
          <div className={`mt-1 text-[10px] text-slate-400 flex flex-wrap gap-x-2 ${mine ? "justify-end" : ""}`}>
            {at && <time dateTime={at}>{fmtWhen(at)}</time>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
