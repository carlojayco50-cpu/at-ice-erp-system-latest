import { useEffect, useState } from "react";
import { Navigate, NavLink, useLocation, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import AccountSettings from "../../components/AccountSettings";
import SystemSettings from "../../components/SystemSettings";
import { ActivityFeed, TipsWidget } from "../../components/Insight";
import { formatDateTime } from "../../lib/time";

// Admin > Settings: one page per item of the Settings sub-menu
// (/admin/settings/account, /rates, /admin-pin, /old-records), with the same
// items as tabs on top. "Rates and rules" holds the holiday and overtime pay
// rates too. Beside the settings: the latest audited changes and reminders.
const PAGES = [
  { key: "account", label: "Account", hint: "Your name, login email and password." },
  { key: "rates", label: "Rates and rules", hint: "Payroll, attendance, leave, kiosk and delivery rules, with holiday and overtime pay." },
  { key: "admin-pin", label: "Admin PIN", hint: "The 6-digit PIN that unlocks a locked Attendance Station kiosk." },
  { key: "old-records", label: "Old records", hint: "Inactive employees and old attendance past the retention period." },
];

// Old links used one long page with #sections.
const OLD_HASH = {
  "#settings-account": "account",
  "#settings-rates": "rates",
  "#settings-admin-pin": "admin-pin",
  "#settings-retention": "old-records",
};

// Which audit actions belong to which page
const ACTIONS = {
  account: /password|account|login|profile|session/i,
  rates: /setting|multiplier|rate|contribution/i,
  "admin-pin": /pin|kiosk/i,
  "old-records": /retention|anonym|purge|archive|hold/i,
};

const TIPS = {
  account: [
    { title: "Use a strong password", text: "At least 8 characters with upper and lower case, a number and a symbol.", tone: "cyan", icon: "key" },
    { title: "Signed in elsewhere?", text: "Sign out other devices from this page if a phone or computer was lost.", tone: "amber", icon: "shield" },
  ],
  rates: [
    { title: "Every change is audited", text: "The old and new value and who changed it are kept in the audit log.", tone: "violet", icon: "file" },
    { title: "Rates are dated", text: "Holiday and overtime rates apply from their effective date; past payrolls keep their rates.", tone: "cyan", icon: "calendar" },
  ],
  "admin-pin": [
    { title: "Only for locked kiosks", text: "Type this 6-digit PIN on a kiosk locked after too many wrong HR PINs.", tone: "amber", icon: "key" },
    { title: "Keep it private", text: "HR has its own 4-digit PIN; this one is the Admin's override.", tone: "rose", icon: "shield" },
  ],
  "old-records": [
    { title: "Download before you delete", text: "Keep a CSV of an old record first; deleting cannot be undone.", tone: "rose", icon: "file" },
    { title: "Anonymize keeps pay history", text: "The employee ID and pay records stay; personal details are cleared.", tone: "violet", icon: "users" },
  ],
};

function useAuditLog() {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/audit-logs", { headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setLogs(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setLogs([]); });
    return () => { alive = false; };
  }, []);
  return logs;
}

const humanize = (action) => String(action || "").replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function SettingsPage() {
  const { section } = useParams();
  const { hash } = useLocation();
  const logs = useAuditLog();

  if (!section) return <Navigate to={`/admin/settings/${OLD_HASH[hash] || "account"}`} replace />;
  const page = PAGES.find((p) => p.key === section);
  if (!page) return <Navigate to="/admin/settings/account" replace />;

  const changes = (logs || [])
    .filter((l) => ACTIONS[section].test(l.action || ""))
    .map((l) => ({ id: l.id, title: humanize(l.action), meta: `by ${l.user_name || "System"}`, when: formatDateTime(l.created_at, { year: false }), tone: "violet", icon: "file" }));

  return (
    <AdminLayout pageTitle={`Settings · ${page.label}`} breadcrumb={`Settings / ${page.label}`}>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 flex flex-col gap-5 min-w-0">
          <nav aria-label="Settings pages" className="flex flex-wrap gap-1.5" data-fx-tabs>
            {PAGES.map((p) => (
              <NavLink
                key={p.key}
                to={`/admin/settings/${p.key}`}
                className={({ isActive }) => `px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${isActive ? "bg-cyan-500 text-white" : "border border-black/[0.09] bg-white text-slate-600 hover:text-cyan-700"}`}
              >
                {p.label}
              </NavLink>
            ))}
          </nav>
          <p className="-mt-2 text-[12px] text-slate-500">{page.hint}</p>
          {section === "account" ? <AccountSettings /> : <SystemSettings section={section} />}
        </div>
        <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0 xl:sticky xl:top-0">
          <ActivityFeed title="Recent changes" subtitle="From the audit log" items={changes} empty={logs === null ? "Loading the audit log…" : "No changes recorded for this page yet."} max={6} />
          <TipsWidget tips={TIPS[section]} />
        </aside>
      </div>
    </AdminLayout>
  );
}
