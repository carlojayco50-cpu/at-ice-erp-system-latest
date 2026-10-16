import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { useLogoutConfirm } from "../lib/useLogoutConfirm";
import { initialsOf } from "../lib/initials";
import { ROLE_NAV, ROLE_LABEL } from "../lib/mobileUi";
import LeaveRequestButton from "./LeaveRequestButton";
import HeaderAvatar from "./HeaderAvatar";
import { ScopeStatusRow } from "./NightMode";
import { Icon } from "./MobileUi";

// The one app shell of the Maintenance, Checker and Salesman screens (AT-ICE
// mobile contract): a 56px sticky header (page title; role badge, leave
// request and profile on the right), the page in a 16px-padded column, and a
// 64px bottom navigation with the role's tabs. `actionBar` is the page's main
// action, kept just above the navigation. It sits inside NightScope (App.jsx),
// so the ice theme and night mode apply.
export default function RoleShell({ role, title, children, actionBar = null, headerAction = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const label = ROLE_LABEL[role] || role;
  const [askLogout, logoutDialog] = useLogoutConfirm(() => {
    clearSession();
    navigate("/login");
  });

  return (
    <div className={`role-shell min-h-[100dvh] w-full overflow-x-hidden bg-slate-50 ${actionBar ? "pb-40" : "pb-20"}`}>
      {logoutDialog}

      <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 px-4 flex flex-nowrap items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 text-lg font-bold text-slate-900 truncate">{title}</h1>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {headerAction}
          <span className="hidden min-[380px]:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">{label}</span>
          <LeaveRequestButton compact />
          <HeaderAvatar initials={initialsOf(user?.name, label.slice(0, 2).toUpperCase())} name={user?.name || label} subtitle={user?.email || label} onSignOut={askLogout} mobileSignOut />
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-md mx-auto md:max-w-none">
        <ScopeStatusRow className="" />
        {children}
      </main>

      {actionBar}

      <nav aria-label={`${label} sections`} className="role-nav fixed bottom-0 inset-x-0 z-50 h-16 bg-white border-t border-slate-200 flex justify-around items-center">
        {(ROLE_NAV[role] || []).map((tab) => {
          const active = tab.match ? tab.match(location) : location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] h-full text-[11px] font-semibold active:scale-[0.98] transition-transform ${active ? "text-cyan-600" : "text-slate-400"}`}
            >
              <Icon name={tab.icon} size={22} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
