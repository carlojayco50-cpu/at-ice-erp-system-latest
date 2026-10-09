import { useNavigate } from "react-router-dom";

const CalendarIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// The one Leave Request entry point for every role that files its own leave
// (Checker, Maintenance, Salesman, Driver). It always sits in the top bar,
// directly left of the Log Out button.
export default function LeaveRequestButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/my-leave")}
      title="Leave Request"
      aria-label="Leave Request"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-black/[0.08] rounded-lg text-slate-600 text-[11px] font-medium active:bg-slate-200 transition-colors cursor-pointer"
    >
      <CalendarIcon />
      {/* On very small phones (under 360px) only the icon shows, so it stays beside the name */}
      <span className="hidden min-[360px]:inline">Leave Request</span>
    </button>
  );
}
