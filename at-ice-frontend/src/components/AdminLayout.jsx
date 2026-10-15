import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { clearSession } from "../lib/auth";
import { NightStyle, NightToggle } from "./NightMode";
import { ambientStyle, useNightMode } from "../lib/theme";
import { useLogoutConfirm } from "../lib/useLogoutConfirm";
import HeaderAvatar from "./HeaderAvatar";
import SidebarSignOut from "./SidebarSignOut";
import LiveClock from "./LiveClock";
import { initialsOf } from "../lib/initials";

const GridIcon     = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const UsersIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const DollarIcon   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const TruckIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const UserIcon     = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>;
const ClipboardIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>;
const ReceiptIcon  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2V2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>;
const BoardIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/></svg>;
const ChevRight    = () => <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>;
const InboxIcon    = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
const MenuIcon     = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const XIcon        = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

const SettingsIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

const navSections = [
  { label:"Overview", items:[{ icon:<GridIcon />, label:"Dashboard", path:"/dashboard" }] },
  { label:"HRIS",     items:[
      { icon:<UsersIcon />, label:"Employees", path:"/admin/employees" },
      { icon:<ReceiptIcon />, label:"Payroll", path:"/admin/payroll" },
      { icon:<ClipboardIcon />, label:"Holidays", path:"/admin/holidays" },
    ] },
  { label:"Delivery", items:[
      { icon:<TruckIcon />, label:"Deliveries", path:"/admin/deliveries" },
    ] },
  { label:"Inventory", items:[
      { icon:<ClipboardIcon />, label:"Stock-Out Approvals", path:"/admin/stock-out-approvals" },
      { icon:<BoardIcon />, label:"Projects", path:"/admin/projects" },
    ] },
  { label:"CRM",      items:[
      { icon:<UserIcon />, label:"Customers", path:"/admin/customers" },
      { icon:<ReceiptIcon />, label:"Invoices", path:"/admin/receipts" },
      { icon:<DollarIcon />, label:"Customer Prices", path:"/admin/customer-prices" },
      { icon:<InboxIcon />, label:"Support Inbox", path:"/admin/support-inbox" },
    ] },
  { label:"Account",  items:[{ icon:<SettingsIcon />, label:"Settings", path:"/admin/settings" }] },
];

export default function AdminLayout({ pageTitle, breadcrumb, headerActions, children }) {
  const navigate = useNavigate();
  const location = useLocation();
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
      <nav className="py-2.5 flex-1">
        {navSections.map((sec) => (
          <div key={sec.label}>
            <div className="rail-section px-[18px] pt-3.5 pb-1 text-[10px] tracking-[0.1em] uppercase text-slate-400 font-medium">{sec.label}</div>
            {sec.items.map((item) => {
              const isActive = item.path && location.pathname === item.path;
              return (
                <div
                  key={item.label}
                  onClick={() => item.path && go(item.path)}
                  className={`flex items-center gap-2.5 px-[18px] py-[7px] text-[13px] cursor-pointer transition-all duration-100 border-l-2 ${isActive ? "text-cyan-500 bg-cyan-500/[0.08] border-cyan-500" : "text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50"}`}
                >
                  <span className="opacity-80 flex-shrink-0">{item.icon}</span><span className="rail-label truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </nav>
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
    <div className={`${dark ? "cp-dark " : ""}neu flex font-sans text-[13px] leading-relaxed bg-[#0a0d12] text-slate-800 min-h-screen`}>
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
      <div className="rail-slot hidden lg:block flex-shrink-0">
        <aside className="rail sticky top-0 h-screen bg-white border-r border-black/[0.09] flex flex-col overflow-y-auto overflow-x-hidden">
          {sidebar}
        </aside>
      </div>

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
