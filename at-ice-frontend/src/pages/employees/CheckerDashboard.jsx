import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { clearSession } from "../../lib/auth";
import { useLogoutConfirm } from "../../lib/useLogoutConfirm";
import LeaveRequestButton from "../../components/LeaveRequestButton";
import HeaderAvatar from "../../components/HeaderAvatar";
import { ScopeStatusRow } from "../../components/NightMode";
import { initialsOf } from "../../lib/initials";

// Functional UI icons only: navigation + actions, not decoration
const ChevronRightIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Stock-out release is not listed here: the Admin approves and releases
// Maintenance stock-out requests.
const MODULES = [
  {
    title: "Pickup Log",
    description: "Log Alexandra and J-Maxine pickups at the plant.",
    route: "/checker/pickup-log",
  },
  {
    title: "Ice Loading Count",
    description: "Count sacks loaded per delivery truck.",
    route: "/checker/ice-loading",
  },
  {
    title: "Inventory Management",
    description: "View stock levels and low stock alerts.",
    route: "/checker/inventory",
  },
  {
    title: "Stock In / Stock Out",
    description: "Log stock movement with double-entry confirmation.",
    route: "/checker/stock-movements",
  },
  {
    title: "Supplier Management",
    description: "Manage supplier records and details.",
    route: "/checker/suppliers",
  },
];

export default function CheckerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };
  const [askLogout, logoutDialog] = useLogoutConfirm(handleLogout);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {logoutDialog}

      {/* Top Bar */}
      <header className="bg-white border-b border-black/[0.08] px-5 pt-4 pb-4 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="brand-logo w-11 h-11 flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-slate-800 leading-tight">
                {user?.name || "Checker"}
              </div>
              <div className="text-[11px] text-slate-400 tracking-wide">Checker</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LeaveRequestButton />
            <HeaderAvatar initials={initialsOf(user?.name, "CH")} name={user?.name || "Checker"} subtitle={user?.email || "Checker"} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>

        <ScopeStatusRow />
        <div className="mt-3">
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">Checker Dashboard</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* Module List: plain text, no decorative icons or color dots */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {MODULES.map((mod) => (
          <button
            key={mod.title}
            onClick={() => navigate(mod.route)}
            className="w-full text-left bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm px-4 py-4 flex items-center justify-between gap-3 cursor-pointer active:bg-slate-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-800">
                {mod.title}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                {mod.description}
              </div>
            </div>
            <span className="text-slate-300 flex-shrink-0">
              <ChevronRightIcon />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
