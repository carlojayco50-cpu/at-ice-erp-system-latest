// AT-ICE mobile contract (owner, 2026-10-17): the shared rules of the
// Maintenance, Checker and Salesman screens. Components are in
// components/RoleShell.jsx and components/MobileUi.jsx.

// One meaning, one color, on every role screen.
export const TONE_CLASS = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",   // Pending / Queued / Scheduled
  progress: "bg-blue-50 text-blue-700 border border-blue-200",     // In progress / Active / On route / Checking
  done: "bg-emerald-50 text-emerald-700 border border-emerald-200", // Completed / Verified / Delivered / Operational
  urgent: "bg-rose-50 text-rose-700 border border-rose-200",       // Urgent / Breakdown / Discrepancy / Cancelled
};

// A record status => tone.
const STATUS_TONE = {
  pending: "pending", queued: "pending", scheduled: "pending", planned: "pending", draft: "pending", waiting: "pending",
  approved: "progress", in_transit: "progress", working: "progress", active: "progress", checking: "progress", loading: "progress",
  released: "done", delivered: "done", confirmed: "done", verified: "done", done: "done", completed: "done", paid: "done", counted: "done",
  rejected: "urgent", cancelled: "urgent", stuck: "urgent", overdue: "urgent", low: "urgent", out: "urgent", discrepancy: "urgent",
};
export const toneFor = (status) => STATUS_TONE[String(status || "").toLowerCase()] || "pending";

// Card, field and button classes every role screen uses.
export const CARD = "bg-white border border-slate-200 rounded-xl p-4";
export const CARD_BUTTON = `${CARD} w-full text-left active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none`;
export const FIELD = "w-full min-h-[44px] px-3 border border-slate-200 rounded-xl bg-white text-base text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";
export const TEXTAREA = "w-full min-h-[88px] px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-base text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-none";
export const LABEL = "block text-[13px] font-medium text-slate-600 mb-1.5";
export const BTN = "inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 rounded-xl text-[15px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
export const BTN_PRIMARY = `${BTN} bg-cyan-500 text-white`;
export const BTN_SECONDARY = `${BTN} bg-white border border-slate-200 text-slate-700`;
export const BTN_DANGER = `${BTN} bg-red-500 text-white`;

// Bottom navigation per role (4 to 5 tabs at most). icon: a key in MobileUi's icon set.
export const ROLE_NAV = {
  maintenance: [
    { to: "/maintenance/dashboard", label: "Home", icon: "home" },
    { to: "/maintenance/stock-out-request", label: "Parts", icon: "wrench" },
    { to: "/maintenance/projects", label: "Projects", icon: "clipboard" },
  ],
  checker: [
    { to: "/checker/dashboard", label: "Home", icon: "home" },
    { to: "/checker/ice-loading", label: "Loading", icon: "truck" },
    { to: "/checker/inventory", label: "Inventory", icon: "box" },
    { to: "/checker/stock-movements", label: "Stock", icon: "swap" },
    { to: "/checker/suppliers", label: "Suppliers", icon: "users" },
  ],
  salesman: [
    { to: "/salesman/deliveries", label: "To deliver", icon: "truck", match: (loc) => loc.pathname.startsWith("/salesman/deliveries") && !loc.search.includes("view=delivered") },
    { to: "/salesman/deliveries?view=delivered", label: "Delivered", icon: "check", match: (loc) => loc.search.includes("view=delivered") },
  ],
};

export const ROLE_LABEL = { maintenance: "Maintenance", checker: "Checker", salesman: "Salesman" };
