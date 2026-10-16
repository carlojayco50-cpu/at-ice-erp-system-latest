import { Navigate, NavLink, useLocation, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import AccountSettings from "../../components/AccountSettings";
import SystemSettings from "../../components/SystemSettings";

// Admin > Settings: one page per item of the Settings sub-menu
// (/admin/settings/account, /rates, /admin-pin, /old-records), with the same
// items as tabs on top. "Rates and rules" holds the holiday and overtime pay
// rates too.
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

export default function SettingsPage() {
  const { section } = useParams();
  const { hash } = useLocation();

  if (!section) return <Navigate to={`/admin/settings/${OLD_HASH[hash] || "account"}`} replace />;
  const page = PAGES.find((p) => p.key === section);
  if (!page) return <Navigate to="/admin/settings/account" replace />;

  return (
    <AdminLayout pageTitle={`Settings · ${page.label}`} breadcrumb={`Settings / ${page.label}`}>
      <div className="flex flex-col gap-5 max-w-4xl">
        <nav aria-label="Settings pages" className="flex flex-wrap gap-1.5">
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
    </AdminLayout>
  );
}
