import { useEffect, useState } from "react";
import PasswordRules from "./PasswordRules";
import PasswordInput from "./PasswordInput";
import { isStrongPassword } from "../lib/password";

const ROLE_LABELS = {
  admin: "System Administrator",
  hr: "Human Resources",
  employee: "Employee",
  driver: "Driver",
  customer: "Customer",
};

const SUB_ROLE_LABELS = {
  checker: "Checker",
  salesman: "Salesman",
  maintenance: "Maintenance",
};

const authHeaders = () => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const EMPTY_FORM = { current_password: "", password: "", password_confirmation: "" };

const readStoredProfile = () => {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    stored = {};
  }
  return {
    name: stored?.name || "",
    email: stored?.email || "",
    role: localStorage.getItem("role") || "",
    sub_role: localStorage.getItem("sub_role") || "",
  };
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500";

function Card({ title, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function AccountSettings() {
  // ---- Profile (read only) ----
  const [profile, setProfile] = useState(readStoredProfile);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/me", { headers: authHeaders() });
        if (!res.ok) return;
        const me = await res.json();
        setProfile({
          name: me.name || "",
          email: me.email || "",
          role: me.role || "",
          sub_role: me.sub_role || "",
        });
      } catch {
        // keep the values already read from localStorage
      }
    };
    load();
  }, []);

  const roleLabel = [ROLE_LABELS[profile.role] || profile.role, SUB_ROLE_LABELS[profile.sub_role]]
    .filter(Boolean)
    .join(" / ");

  // ---- Change password (inline) ----
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const mismatch =
    form.password_confirmation.length > 0 && form.password !== form.password_confirmation;
  const canSubmit =
    form.current_password && isStrongPassword(form.password) && form.password === form.password_confirmation;

  const submitPassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    setPwError("");
    setPwSuccess("");
    try {
      const res = await fetch("/api/change-password", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const firstFieldError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(firstFieldError || data.message || "Could not change the password.");
      }
      setForm(EMPTY_FORM);
      setPwSuccess("Your password was changed. Other devices signed in to this account were signed out.");
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Sign out other devices ----
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [otherResult, setOtherResult] = useState("");
  const [otherError, setOtherError] = useState("");

  const signOutOthers = async () => {
    setSigningOut(true);
    setOtherError("");
    setOtherResult("");
    try {
      const res = await fetch("/api/logout-others", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not sign out other devices.");
      setOtherResult(data.message);
      setConfirming(false);
    } catch (err) {
      setOtherError(err.message);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card title="Profile" description="Your account details. Ask the system administrator if something needs to change.">
        <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd className="font-medium text-slate-800">{profile.name || "N/A"}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium text-slate-800">{profile.email || "N/A"}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd className="font-medium text-slate-800">{roleLabel || "N/A"}</dd>
        </dl>
      </Card>

      <Card
        title="Change password"
        description="You need your current password. Choose a new password that follows the rules below, different from your current one."
      >
        <form onSubmit={submitPassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Current password</label>
            <PasswordInput
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              className={inputClass}
            />
            <PasswordRules password={form.password} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Confirm new password</label>
            <PasswordInput
              value={form.password_confirmation}
              onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
              autoComplete="new-password"
              className={inputClass}
            />
            {mismatch && <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>}
          </div>


          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-emerald-700">{pwSuccess}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Change password"}
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Sign out other devices"
        description="Use this if you forgot to sign out somewhere else. You stay signed in on this device."
      >
        {!confirming ? (
          <button
            onClick={() => {
              setConfirming(true);
              setOtherResult("");
              setOtherError("");
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out other devices
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Sign out of every other device?</span>
            <button
              onClick={signOutOthers}
              disabled={signingOut}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {signingOut ? "Working..." : "Yes, sign them out"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={signingOut}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
        {otherResult && <p className="mt-3 text-sm text-emerald-700">{otherResult}</p>}
        {otherError && <p className="mt-3 text-sm text-red-600">{otherError}</p>}
      </Card>
    </div>
  );
}