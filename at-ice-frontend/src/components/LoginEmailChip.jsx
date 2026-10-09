import { useState } from "react";
import { toast } from "../lib/toast";

// Login email chip with a pencil to fix a wrong email (PUT /api/accounts/{id}/email).
// Only roles higher up may change it: Admin for HR, employee, driver and
// customer logins; HR for employee and driver logins (the server checks).
// onSaved(newEmail) lets the page update its list.
export default function LoginEmailChip({ userId, email, onSaved }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const start = () => { setValue(email); setError(""); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const next = value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) { setError("Enter a full email, e.g. name@gmail.com."); return; }
    if (next === email) { setOpen(false); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/accounts/${userId}/email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ email: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.errors?.email?.[0] || data?.message || "Couldn't change the email."); return; }
      setOpen(false);
      toast.success(`Login email changed to ${data.email}.`);
      onSaved?.(data.email);
    } catch {
      setError("Couldn't change the email. Check the connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <span className="email-chip">{email}</span>
        <button
          type="button"
          onClick={start}
          title="Change login email"
          aria-label={`Change login email ${email}`}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
        </button>
      </span>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && setOpen(false)}>
          <form onSubmit={save} className="bg-white rounded-xl border border-black/[0.09] w-full max-w-sm p-5 text-left">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1">Change login email</h3>
            <p className="text-[12px] text-slate-500 mb-3">
              Fix a wrong login email. The password stays the same; they sign in with the new email from now on.
            </p>
            <label className="text-[11px] text-slate-500 mb-1 block">New login email</label>
            <input
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required
              autoComplete="off"
              className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500"
            />
            {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px]">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
