// Shown on the Checker, Salesman, Maintenance and Driver pages until they
// have timed in at the kiosk today (see useTimedIn in lib/timeIn.js).
// timedIn null = still checking.
export default function TimeInNotice({ timedIn, className = "" }) {
  if (timedIn !== false) return null;
  return (
    <div
      role="alert"
      className={`text-[12px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 ${className}`}
    >
      <span className="font-semibold">Time in first.</span> You have not timed in at the Attendance
      Station today. You can view records, but saving is turned off until your Time In is recorded.
    </div>
  );
}
