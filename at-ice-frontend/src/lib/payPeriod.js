// The pay period (cutoff) a date falls in: fixed blocks of `days` days
// counted from `anchor` (both from the payroll.anchor and payroll.cutoff_days
// settings; the server's GET pay-period gives the same answer). Dates only
// ("YYYY-MM-DD"), worked out in UTC, so the local timezone can never shift a
// day. Any date works, past or future: 2026-10-14 -> 2026-10-12 to 2026-10-25.
// Same rule as the backend (App\Support\PayPeriod).

const DAY = 86400000;

const toUtc = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toYmd = (ms) => new Date(ms).toISOString().slice(0, 10);

export const DEFAULT_ANCHOR = "2026-01-05";
export const DEFAULT_CUTOFF_DAYS = 14;

// { start, end } as "YYYY-MM-DD"
export function getPayPeriod(date, anchor = DEFAULT_ANCHOR, days = DEFAULT_CUTOFF_DAYS) {
  const d = toUtc(date);
  const diff = Math.round((d - toUtc(anchor)) / DAY);
  const offset = ((diff % days) + days) % days;
  const start = d - offset * DAY;
  return { start: toYmd(start), end: toYmd(start + (days - 1) * DAY) };
}

// The period before or after the one a date falls in (step -1 or +1).
export function shiftPayPeriod(date, step, anchor = DEFAULT_ANCHOR, days = DEFAULT_CUTOFF_DAYS) {
  const { start } = getPayPeriod(date, anchor, days);
  return getPayPeriod(toYmd(toUtc(start) + step * days * DAY), anchor, days);
}

// "Oct 12 – Oct 25, 2026"
export function payPeriodLabel({ start, end }) {
  const fmt = (ymd, withYear) =>
    new Date(toUtc(ymd)).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}
