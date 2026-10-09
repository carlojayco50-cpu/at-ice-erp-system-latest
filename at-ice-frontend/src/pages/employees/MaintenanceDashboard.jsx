import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { clearSession } from "../../lib/auth";
import { useLogoutConfirm } from "../../lib/useLogoutConfirm";
import LeaveRequestButton from "../../components/LeaveRequestButton";
import HeaderAvatar from "../../components/HeaderAvatar";
import { ScopeStatusRow } from "../../components/NightMode";
import { initialsOf } from "../../lib/initials";

const WrenchIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M14.7 6.3a4 4 0 10-5.66 5.66L2 19l3 3 7.03-7.04a4 4 0 005.67-5.66l-2.83 2.83-2.12-2.12 2.83-2.83z" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const MODULES = [
  {
    title: "Request Stock Out",
    description: "Submit a request for truck parts or machine components.",
    icon: WrenchIcon,
    dot: "bg-cyan-500",
    route: "/maintenance/stock-out-request",
  },
];

export default function MaintenanceDashboard() {
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
                {user?.name || "Maintenance"}
              </div>
              <div className="text-[11px] text-slate-400 tracking-wide">Maintenance</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LeaveRequestButton />
            <HeaderAvatar initials={initialsOf(user?.name, "MA")} name={user?.name || "Maintenance"} subtitle={user?.email || "Maintenance"} onSignOut={askLogout} mobileSignOut />
          </div>
        </div>

        <ScopeStatusRow />
        <div className="mt-3">
          <div className="text-[18px] font-semibold tracking-tight text-slate-800 leading-tight">Maintenance Dashboard</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* Module List */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-8">
        {MODULES.map((mod) => (
          <button
            key={mod.title}
            onClick={() => navigate(mod.route)}
            className="w-full text-left bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-sm px-4 py-4 flex items-start gap-3 cursor-pointer active:bg-slate-50 transition-colors"
          >
            <div className="mt-1 flex-shrink-0">
              <span className={`w-2 h-2 rounded-full inline-block ${mod.dot}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                <mod.icon />
                {mod.title}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                {mod.description}
              </div>
            </div>
            <span className="text-slate-300 flex-shrink-0 mt-1">
              <ChevronRightIcon />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
