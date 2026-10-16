// A 12-hour time field: hour, minute and AM/PM dropdowns, so the time reads
// the same on every computer ("9:00 AM"), whatever the OS clock setting.
// The value in and out stays 24-hour "HH:mm", the format the API expects.
// onChange gets an event-like { target: { value } } so it can replace an
// <input type="time"> without changing the page's handler.

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const pad = (n) => String(n).padStart(2, "0");

function parse(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1];
  return { h12: ((h + 11) % 12) + 1, min: +m[2], pm: h >= 12 };
}

export default function TimeSelect({ id, value, onChange, step = 5, required, className = "", selectClassName = "", nativeSelects = false }) {
  const cur = parse(value);
  const minutes = [];
  for (let i = 0; i < 60; i += step) minutes.push(i);
  if (cur && !minutes.includes(cur.min)) {
    minutes.push(cur.min);
    minutes.sort((a, b) => a - b);
  }

  const emit = (patch) => {
    const next = { h12: 9, min: 0, pm: false, ...cur, ...patch };
    const h24 = (next.h12 % 12) + (next.pm ? 12 : 0);
    onChange?.({ target: { value: `${pad(h24)}:${pad(next.min)}` } });
  };

  const native = nativeSelects ? { "data-native": true } : {};
  return (
    <div className={`flex items-center gap-1 ${className}`} role="group" aria-label="Time">
      <select id={id} aria-label="Hour" required={required} value={cur ? cur.h12 : ""} onChange={(e) => emit({ h12: +e.target.value })} className={selectClassName} {...native}>
        {!cur && <option value="" disabled>--</option>}
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minute" required={required} value={cur ? cur.min : ""} onChange={(e) => emit({ min: +e.target.value })} className={selectClassName} {...native}>
        {!cur && <option value="" disabled>--</option>}
        {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
      <select aria-label="AM or PM" required={required} value={cur ? (cur.pm ? "PM" : "AM") : ""} onChange={(e) => emit({ pm: e.target.value === "PM" })} className={selectClassName} {...native}>
        {!cur && <option value="" disabled>--</option>}
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
