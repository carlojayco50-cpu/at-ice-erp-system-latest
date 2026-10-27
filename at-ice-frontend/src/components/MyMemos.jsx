import { useCallback, useEffect, useState } from "react";
import { BottomSheet, StatusBadge } from "./MobileUi";
import { useLiveTick } from "../lib/live";
import { formatDateShort, formatDateTime } from "../lib/time";
import { openProtectedFile } from "../lib/openFile";
import { toast } from "../lib/toast";
import { MEMO_LEVEL, MEMO_STATUS, isUrgentMemo } from "../lib/memos";
import { Icon } from "./icons";

// The employee's side of disciplinary memos (Checker, Salesman, Maintenance,
// Driver): a Memos button in the top bar (with a count of memos to read or
// sign), a sheet listing every memo HR has sent with its files, Acknowledge
// receipt for a verbal or first written warning, and an urgent banner while a
// memo waits for the employee to sign it at the HR office.

const authHeaders = () => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

function useMyMemos() {
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/my-memos", { headers: authHeaders() });
      if (!res.ok) throw new Error("Your memos could not be loaded.");
      setMemos(await res.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when HR sends a memo (lib/live.js), or when the employee
  // acknowledged one here (the banner and the button then agree)
  const live = useLiveTick(["memos"]);
  useEffect(() => {
    load();
  }, [load, live]);
  useEffect(() => {
    window.addEventListener("memos:changed", load);
    return () => window.removeEventListener("memos:changed", load);
  }, [load]);

  return { memos, loading, error, load, setMemos };
}

const FileIcon = () => (
  <Icon name="file" size={16} />
);

function MemoCard({ memo, onAcknowledged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const level = MEMO_LEVEL[memo.level] || { label: memo.level_label, cls: "" };
  const status = MEMO_STATUS[memo.status] || { label: memo.status };

  const acknowledge = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/my-memos/${memo.id}/acknowledge`, { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not acknowledge the memo.");
      toast.success("Memo acknowledged.");
      onAcknowledged(memo.id, data.acknowledged_at);
      window.dispatchEvent(new Event("memos:changed"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${isUrgentMemo(memo) ? "border-rose-300 bg-rose-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${level.cls}`}>{level.label}</span>
        <StatusBadge tone={memo.status === "sent" ? "pending" : memo.status === "awaiting_physical" ? "urgent" : "done"}>{status.label}</StatusBadge>
      </div>
      <div className="text-[15px] font-semibold text-slate-900 break-words">{memo.subject}</div>
      <div className="text-[12px] text-slate-500">{memo.memo_no} · incident {formatDateShort(memo.incident_date, { year: true })} · sent {formatDateTime(memo.issued_at, { year: false })}</div>

      {isUrgentMemo(memo) && (
        <div className="rounded-lg bg-rose-600 text-white px-3 py-2 text-[13px] font-semibold">URGENT: Report to the HR office for physical sign-off and the administrative hearing.</div>
      )}

      <button type="button" data-no-confirm onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-[14px] font-medium text-cyan-700 min-h-[44px]">
        {open ? "Hide the memo" : "Read the memo"}
      </button>
      {open && <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[14px] text-slate-800 whitespace-pre-wrap break-words shadow-inner">{memo.body}</div>}

      {(memo.files || []).length > 0 && (
        <ul className="space-y-1">
          {memo.files.map((f) => (
            <li key={f.id}>
              <button type="button" data-no-confirm onClick={() => openProtectedFile(`/api/my-memos/${memo.id}/files/${f.id}`, f.original_name)} className="flex items-center gap-2 min-h-[44px] text-[14px] text-cyan-700 text-left">
                <FileIcon /> <span className="break-all">{f.original_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {memo.status === "sent" && (
        <button type="button" disabled={busy} onClick={acknowledge} title="Confirm that you received and read this memo" className="w-full min-h-[44px] rounded-xl bg-cyan-600 text-white text-[15px] font-semibold disabled:opacity-60">
          {busy ? "Saving…" : "Acknowledge receipt"}
        </button>
      )}
      {memo.acknowledged_at && <div className="text-[12px] text-emerald-700">You acknowledged this on {formatDateTime(memo.acknowledged_at)}.</div>}
      {memo.status === "archived" && <div className="text-[12px] text-cyan-800">Signed at the HR office{memo.signed_at ? ` on ${formatDateShort(memo.signed_at, { year: true })}` : ""}.</div>}
    </div>
  );
}

// Top-bar button: opens the sheet; the badge counts memos to read or sign.
export function MyMemosButton({ compact = false }) {
  const { memos, loading, error, load, setMemos } = useMyMemos();
  const [open, setOpen] = useState(false);
  const pending = memos.filter((m) => m.status === "sent" || m.status === "awaiting_physical").length;

  return (
    <>
      <button
        type="button"
        data-no-confirm
        onClick={() => setOpen(true)}
        title={pending ? `My Memos: ${pending} need your attention` : "My Memos"}
        aria-label={pending ? `My Memos, ${pending} need your attention` : "My Memos"}
        className={`relative flex items-center justify-center bg-slate-100 border border-black/[0.08] text-slate-600 active:scale-[0.98] transition-transform cursor-pointer ${compact ? "min-h-[44px] min-w-[44px] rounded-xl" : "gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"}`}
      >
        <FileIcon />
        {!compact && <span className="hidden min-[360px]:inline">Memos</span>}
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">{pending}</span>
        )}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="My Memos">
        {loading ? (
          <div className="text-[14px] text-slate-500">Loading your memos…</div>
        ) : error ? (
          <div className="space-y-2">
            <div className="text-[14px] text-red-700">{error}</div>
            <button type="button" data-no-confirm onClick={load} className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-[14px]">Try again</button>
          </div>
        ) : memos.length === 0 ? (
          <div className="text-[14px] text-slate-500">You have no memos from HR.</div>
        ) : (
          memos.map((m) => (
            <MemoCard key={m.id} memo={m} onAcknowledged={(id, at) => setMemos((list) => list.map((x) => (x.id === id ? { ...x, status: "acknowledged", acknowledged_at: at } : x)))} />
          ))
        )}
      </BottomSheet>
    </>
  );
}

// Urgent banner at the top of the page while a memo waits for a wet signature.
export function MemoAlert() {
  const { memos } = useMyMemos();
  const urgent = memos.filter(isUrgentMemo);
  const unread = memos.filter((m) => m.status === "sent");
  if (!urgent.length && !unread.length) return null;

  return urgent.length ? (
    <div role="alert" className="rounded-xl bg-rose-600 text-white px-4 py-3 text-[14px] font-semibold">
      URGENT: Report to the HR office for physical sign-off and the administrative hearing ({urgent.map((m) => m.memo_no).join(", ")}). Open Memos in the top bar to read it.
    </div>
  ) : (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-[14px] font-medium">
      You have {unread.length === 1 ? "a memo" : `${unread.length} memos`} from HR to read and acknowledge. Open Memos in the top bar.
    </div>
  );
}
