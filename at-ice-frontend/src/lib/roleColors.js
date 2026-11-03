// One color per role, position and shift, used everywhere they appear:
// Staff by role / Staff by position bars, the Employees table role badges,
// filter chips and detail views. A position takes the color of the role it
// logs in as, so Checker is cyan whether it is shown as a role or a position.
// Tone names are the ones in lib/kpiTones.js.

export const ROLE_TONE = {
  checker: "cyan",
  driver: "violet",
  maintenance: "amber",
  salesman: "emerald",
  guard: "blue",
  bagger: "orange",
  hr: "rose",
  admin: "slate",
  "admin staff": "slate",
};

export const SHIFT_TONE = { day: "amber", night: "violet" };

// "Checker", "checker", "Admin Staff" -> its tone; anything else is neutral.
export const roleTone = (key) => ROLE_TONE[String(key || "").trim().toLowerCase()] || "slate";

// Badge classes per tone (written out so Tailwind keeps them).
const BADGE = {
  cyan: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  violet: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  orange: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  rose: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  slate: "bg-slate-100 text-slate-500 border-slate-200",
};

export const roleBadge = (key) => BADGE[roleTone(key)];
