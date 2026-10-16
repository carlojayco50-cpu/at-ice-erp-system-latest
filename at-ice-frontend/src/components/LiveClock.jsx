import { useEffect, useState } from "react";
import { formatTime } from "../lib/time";

// Live date and time for the top bars of every portal, updated every second.
// "Wed, Oct 8, 2026 · 9:41:05 AM" (the date part hides on narrow screens when
// compact is set).
export default function LiveClock({ compact = false, className = "" }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = formatTime(now, { seconds: true });

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/[0.09] rounded-md text-xs text-slate-500 whitespace-nowrap ${className}`}
      aria-label={`${date} ${time}`}
      role="timer"
    >
      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span className={compact ? "hidden md:inline" : ""}>{date} ·</span>
      <span className="font-mono tabular-nums text-slate-700">{time}</span>
    </div>
  );
}
