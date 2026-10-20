// Sidebar menus, one per role, drawn by components/SideNav.jsx.
// A top-level item has an icon, a label and either `to` (a single page) or
// `children` (the pages of that section). Clicking a section opens its first
// child. A child `to` may end in "#id" to jump to a section of that page.
// Keep these in step with the routes and ProtectedRoute rules in App.jsx.

const svg = { width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" };
const GridIcon     = <svg {...svg}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const UsersIcon    = <svg {...svg}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const TruckIcon    = <svg {...svg}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const BoxIcon      = <svg {...svg}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const UserIcon     = <svg {...svg}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>;
const ReceiptIcon  = <svg {...svg}><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2V2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>;
const HeadsetIcon  = <svg {...svg}><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>;
const SettingsIcon = <svg {...svg}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

export const ADMIN_NAV = [
  { icon: GridIcon, label: "Dashboard", to: "/dashboard" },
  { icon: UsersIcon, label: "HRIS", children: [
      { label: "Employees", to: "/admin/employees" },
      { label: "Performance", to: "/admin/performance" },
      { label: "Payroll", to: "/admin/payroll" },
      { label: "Holidays", to: "/admin/holidays" },
    ] },
  // Delivery proofs live inside Deliveries (Proof column and View dialog).
  { icon: TruckIcon, label: "Deliveries", to: "/admin/deliveries" },
  { icon: BoxIcon, label: "Inventory", children: [
      { label: "Stock-Out Approvals", to: "/admin/stock-out-approvals" },
      { label: "Stock Limits", to: "/admin/stock-limits" },
      { label: "Projects", to: "/admin/projects" },
    ] },
  { icon: UserIcon, label: "CRM", children: [
      { label: "Customers", to: "/admin/customers" },
      { label: "Customer Prices", to: "/admin/customer-prices" },
      { label: "Invoices", to: "/admin/receipts" },
      { label: "Support Inbox", to: "/admin/support-inbox" },
    ] },
  // One page per Settings item (pages/Admin/SettingsPage.jsx).
  // "Rates and rules" also holds the holiday and overtime pay rates.
  { icon: SettingsIcon, label: "Settings", children: [
      { label: "Account", to: "/admin/settings/account" },
      { label: "Rates and rules", to: "/admin/settings/rates" },
      { label: "Admin PIN", to: "/admin/settings/admin-pin" },
      { label: "Old records", to: "/admin/settings/old-records" },
    ] },
];

export const HR_NAV = [
  { icon: GridIcon, label: "HR Dashboard", to: "/hr/dashboard" },
  { icon: UsersIcon, label: "HRIS", children: [
      { label: "Employees", to: "/hr/employees" },
      { label: "Interviews", to: "/hr/interviews" },
      { label: "Attendance", to: "/hr/attendance" },
      { label: "Leave Requests", to: "/hr/leave-requests" },
      { label: "Timesheets", to: "/hr/timesheets" },
      { label: "Holidays", to: "/hr/holidays" },
      { label: "Kiosk PIN", to: "/hr/kiosk-pin" },
    ] },
];

export const CUSTOMER_NAV = [
  { icon: GridIcon, label: "Dashboard", to: "/customer/dashboard" },
  { icon: TruckIcon, label: "Deliveries", children: [
      { label: "My Deliveries", to: "/customer/deliveries" },
      { label: "Delivery Proofs", to: "/customer/delivery-proofs" },
    ] },
  { icon: ReceiptIcon, label: "Billing", children: [
      { label: "Invoices & Balance", to: "/customer/receipts" },
      { label: "My Prices", to: "/customer/prices" },
    ] },
  { icon: HeadsetIcon, label: "Contact Support", to: "/customer/support" },
];
