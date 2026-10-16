// Helpers for Admin > Deliveries (Driver View, Store View, Contracts,
// Driver Stores): API calls, dates and labels. Components are in shared.jsx.

export const API_BASE = "/api";

function token() { return localStorage.getItem("token") || ""; }
export function authHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` };
}

// fetch + JSON; throws an Error with the backend's message.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method, headers: authHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

// Today as YYYY-MM-DD in the browser's local time (toISOString would be UTC).
export const todayStr = () => ymd(new Date());
export function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// The next Monday (or today when today is Monday): the usual start of a new assignment.
export function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return ymd(d);
}
export const shortDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const timeOf = (v) => {
  if (!v) return "";
  const t = String(v).includes("T") || String(v).includes(" ") ? String(v).replace(" ", "T") : `1970-01-01T${v}`;
  return new Date(t).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

export const PRODUCT_TYPES = [
  { value: "bags",       label: "Bags (5kg)" },
  { value: "small_sack", label: "Small Sack (30kg)" },
  { value: "big_sack",   label: "Big Sack (50kg)" },
];
export const productLabel = (type) => PRODUCT_TYPES.find((p) => p.value === type)?.label || type;

export const DAYS = [
  { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];
export function daysLabel(days = []) {
  const all = DAYS.map((d) => d.value);
  if (all.every((d) => days.includes(d))) return "Mon–Sun";
  if (all.slice(0, 6).every((d) => days.includes(d)) && days.length === 6) return "Mon–Sat";
  if (all.slice(0, 5).every((d) => days.includes(d)) && days.length === 5) return "Mon–Fri";
  return DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(", ");
}

// Board colors (lib/boardTones.js, monday.com style): a solid status cell.
export const STATUS_STYLE = {
  pending:    { bg: "bg-[#579bfc]", text: "text-white", label: "Pending" },
  queued:     { bg: "bg-[#a25ddc]", text: "text-white", label: "Queued" },
  in_transit: { bg: "bg-[#0e7490]", text: "text-white", label: "In Transit" },
  delivered:  { bg: "bg-[#00c875]", text: "text-white", label: "Delivered" },
  cancelled:  { bg: "bg-[#c4c4c4]", text: "text-white", label: "Cancelled" },
};

// Driver status on the board: worked out from attendance, deliveries and
// leave marks (backend). Only known for today.
export const DRIVER_STATUS = {
  available:   { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Available" },
  in_transit:  { dot: "bg-amber-500",   pill: "bg-amber-50 text-amber-700 border-amber-200",       label: "In transit" },
  unavailable: { dot: "bg-slate-400",   pill: "bg-slate-100 text-slate-600 border-slate-200",       label: "Not timed in" },
  off:         { dot: "bg-red-500",     pill: "bg-red-50 text-red-700 border-red-200",             label: "Off" },
};

export function storeName(c) {
  if (!c) return "—";
  return c.branch_code ? `${c.name} · ${c.branch_code}` : c.name;
}

export const inputCls = "w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500";
export const labelCls = "text-[11px] text-slate-500 mb-1 block";
export const btnPrimary = "px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50";
export const btnGhost = "px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px] hover:bg-slate-50";
