// Every clock shown in the app is 12-hour with AM/PM ("9:05 AM", "11:30 PM"),
// in Philippine time. Values sent to the API stay 24-hour ("HH:mm[:ss]").

export const TZ = "Asia/Manila";

// "HH:mm" or "HH:mm:ss" on its own (a DB TIME column), not a full date.
const CLOCK_RE = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/;

const toDate = (v) => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// 13, 5, 9 -> "1:05 PM" ("1:05:09 PM" with seconds)
function clock12(h, m, s, withSeconds) {
  const hh = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, "0");
  const ss = withSeconds ? `:${String(s || 0).padStart(2, "0")}` : "";
  return `${hh}:${mm}${ss} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * A time of day: "13:05" / "13:05:09" / ISO string / Date -> "1:05 PM".
 * seconds: true adds seconds; tz: false keeps the Date's own local time (for
 * values already parsed as Philippine wall time). Empty -> `fallback`.
 */
export function formatTime(v, { seconds = false, tz = true, fallback = "—" } = {}) {
  if (v == null || v === "") return fallback;
  const m = typeof v === "string" && v.match(CLOCK_RE);
  if (m) return clock12(+m[1], +m[2], +m[3], seconds);
  const d = toDate(v);
  if (!d) return typeof v === "string" ? v : fallback;
  return d.toLocaleTimeString("en-PH", {
    ...(tz ? { timeZone: TZ } : {}), hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: true,
  });
}

/**
 * Date and time: ISO string / Date -> "Oct 16, 2026, 1:05 PM".
 * year: false drops the year; seconds and tz as in formatTime.
 */
export function formatDateTime(v, { year = true, seconds = false, tz = true, fallback = "—" } = {}) {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleString("en-PH", {
    ...(tz ? { timeZone: TZ } : {}), month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}),
    hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: true,
  });
}

// A shift as hours: "9:00 AM – 6:00 PM", or "9:00 PM – 6:00 AM (next day)" overnight.
export function formatShift(start, end) {
  const s = String(start || "").slice(0, 5);
  const e = String(end || "").slice(0, 5);
  if (!s || !e) return "";
  return `${formatTime(s)} – ${formatTime(e)}${e <= s ? " (next day)" : ""}`;
}
