// Sidebar menus, one per role, drawn by components/SideNav.jsx.
import { Icon } from "../components/icons";
// A top-level item has an icon, a label and either `to` (a single page) or
// `children` (the pages of that section). Clicking a section opens its first
// child. A child `to` may end in "#id" to jump to a section of that page.
// Keep these in step with the routes and ProtectedRoute rules in App.jsx.

const GridIcon = <Icon name="grid" size={14} />;
const UsersIcon = <Icon name="users" size={14} />;
const TruckIcon = <Icon name="truck" size={14} />;
const BoxIcon = <Icon name="box" size={14} />;
const UserIcon = <Icon name="user" size={14} />;
const ReceiptIcon = <Icon name="receipt" size={14} />;
const HeadsetIcon = <Icon name="headset" size={14} />;
const SettingsIcon = <Icon name="settings" size={14} />;

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
      { label: "Support Tickets", to: "/admin/support-inbox" },
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
      { label: "Memos", to: "/hr/memos" },
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
