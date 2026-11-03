import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { useLogoutConfirm } from "../lib/useLogoutConfirm";
import { initialsOf } from "../lib/initials";
import { ROLE_NAV, ROLE_LABEL } from "../lib/mobileUi";
import LeaveRequestButton from "./LeaveRequestButton";
import { MemoAlert, MyMemosButton } from "./MyMemos";
import HeaderAvatar from "./HeaderAvatar";
import { ScopeStatusRow } from "./NightMode";
import { Icon } from "./MobileUi";

// The one app shell of the Maintenance, Checker and Salesman screens (AT-ICE
// mobile contract): a 56px sticky header (page title; role badge, leave
// request and profile on the right), the page in a 16px-padded column, and a
// 64px bottom navigation with the role's tabs. `actionBar` is the page's main
// action, kept just above the navigation. It sits inside NightScope (App.jsx),
// so the ice theme and night mode apply. `subHeader` (e.g. a search box)
// stays stuck under the title bar while the page scrolls.
export default function RoleShell({ role, title, children, actionBar = null, headerAction = null, subHeader = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const label = ROLE_LABEL[role] || role;
  const [askLogout, logoutDialog] = useLogoutConfirm(() => {
    clearSession();
    navigate("/login");
  });

  return (
    <div className={`role-shell min-h-[100dvh] w-full overflow-x-clip bg-slate-50 ${actionBar ? "pb-40" : "pb-20"}`}>
      {logoutDialog}

      <header className="role-top sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="h-14 px-4 flex flex-nowrap items-center justify-between gap-2">
          {/* one line, never split mid-word; the role badge only shows when it adds something */}
          <h1 className="page-title min-w-0 flex-1 text-[17px] min-[380px]:text-lg font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{title}</h1>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {headerAction}
            {String(title).toLowerCase() !== String(label).toLowerCase() && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">{label}</span>
            )}
            <MyMemosButton compact />
            <LeaveRequestButton compact />
            <HeaderAvatar initials={initialsOf(user?.name, label.slice(0, 2).toUpperCase())} name={user?.name || label} subtitle={user?.email || label} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>
        {subHeader && <div className="px-4 pb-3 max-w-md mx-auto md:max-w-none">{subHeader}</div>}
      </header>

      <main className="p-4 space-y-4 max-w-md mx-auto md:max-w-none">
        <ScopeStatusRow className="" />
        <MemoAlert />
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
