import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { clearSession } from "../lib/auth";
import { NightStyle, NightToggle } from "./NightMode";
import { ambientStyle, useNightMode } from "../lib/theme";
import { useLogoutConfirm } from "../lib/useLogoutConfirm";
import HeaderAvatar from "./HeaderAvatar";
import SidebarSignOut from "./SidebarSignOut";
import LiveClock from "./LiveClock";
import { initialsOf } from "../lib/initials";
import SideNav from "./SideNav";
import Rail from "./Rail";
import { ADMIN_NAV } from "../lib/nav";
import { Icon } from "./icons";

const ChevRight = () => <Icon name="chevron" size={10} />;
const MenuIcon = () => <Icon name="menu" size={20} />;
const XIcon = () => <Icon name="x" size={18} />;

export default function AdminLayout({ pageTitle, breadcrumb, headerActions, children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [dark, setDark] = useNightMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const go = (path) => { navigate(path); setMobileOpen(false); };

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };
  const [askLogout, logoutDialog] = useLogoutConfirm(handleLogout);
  const initials = initialsOf(user?.name, "AD");

  const sidebar = (
    <>
      <div
        className="px-[18px] pt-5 pb-4 border-b border-black/[0.09] flex items-center gap-2.5 cursor-pointer"
        onClick={() => go("/dashboard")}
      >
        <div className="brand-logo flex-shrink-0 w-10 h-10 bg-slate-900 border border-cyan-500/20 rounded-md flex items-center justify-center overflow-hidden">
          <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
        </div>
        <div>
          <div className="rail-label text-[15px] font-semibold text-slate-800 tracking-wide">Bella Erin</div>
          <div className="rail-label text-[10px] text-slate-400 tracking-widest uppercase">AT-ICE ERP</div>
        </div>
      </div>
      <SideNav items={ADMIN_NAV} onNavigate={() => setMobileOpen(false)} />
      <div className="px-[18px] py-3.5 border-t border-black/[0.09] flex items-center gap-2.5">
        <div className="w-[30px] h-[30px] rounded-full bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-[11px] font-semibold text-cyan-500 flex-shrink-0">{initials}</div>
        <div className="rail-label min-w-0">
          <div className="text-xs font-medium text-slate-800 truncate">{user?.name || "Admin"}</div>
          <div className="text-[10px] text-slate-400">System Administrator</div>
        </div>
        <SidebarSignOut onClick={askLogout} />
      </div>
      </>
  );

  return (
    <div className={`${dark ? "cp-dark " : ""}neu flex font-sans text-[13px] leading-relaxed bg-[#0a0d12] text-slate-800 h-[100dvh] overflow-hidden`}>
      <NightStyle />
      {logoutDialog}

      {/* Phone and tablet: the sidebar opens as a drawer from the menu button */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[260px] max-w-[85vw] h-full bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
              <XIcon />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* SIDEBAR (desktop) */}
      <Rail>
          {sidebar}
        </Rail>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        <header className="h-14 bg-white border-b border-black/[0.09] flex items-center px-4 sm:px-6 gap-3 flex-shrink-0 sticky top-0 z-10">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-500 hover:text-slate-800 p-1 -ml-1 cursor-pointer"
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>
          <div className="min-w-0">
            <div className="text-base font-semibold tracking-tight text-slate-800 truncate">{pageTitle}</div>
            <div className="hidden sm:flex text-xs text-slate-400 items-center gap-1">
              Home <ChevRight /> <span className="text-slate-600">{breadcrumb || pageTitle}</span>
            </div>
          </div>
          <div className="flex-1" />
          {headerActions}
          <NightToggle dark={dark} onToggle={() => setDark((d) => !d)} />
          <LiveClock compact />
          <HeaderAvatar initials={initials} name={user?.name || "Admin"} subtitle="System Administrator" onSignOut={askLogout} settingsPath="/admin/settings" />
        </header>

        <main
          className="ice-main flex-1 overflow-y-auto p-4 sm:p-6 pb-8 flex flex-col gap-4"
          style={ambientStyle(dark)}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
