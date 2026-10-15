// Company details shown in the customer portal (Dashboard and Contact Support).
export const COMPANY = {
  name: "Bella Erin Tube Ice Inc.",
  sister: "Sister company of Alexandra Tube Ice Inc. Operating food-grade commercial ice plants that follow national sanitation codes.",
  address: "Block 63, Lot 3 Anubing St, Amparo Subdivision, Brgy 179 Zone 16, Caloocan City North, 1425 Metro Manila",
  shortAddress: "Amparo Subd, Caloocan City North",
  hotline: "+63 926 011 6955",
  hotlineHref: "tel:+639260116955",
  email: "bellaerin78@gmail.com",
};

// Contact Support topics. Keys must match SupportMessage::TOPICS on the backend.
export const SUPPORT_TOPICS = [
  { key: "delivery_status", label: "Delivery Status & Schedule Confirmation" },
  { key: "emergency_supply", label: "Emergency Ice Shortage / Urgent Additional Sacks" },
  { key: "billing", label: "Billing, Invoice or Payment Clearance" },
  { key: "ice_quality", label: "Ice Quality / Temperature Verification" },
  { key: "contract_rate", label: "Contract Rate or Volume Discount Review" },
];

// Frosted ice card used across the customer portal. bg-white/90 is mapped to
// a dark surface by NightMode, so the same classes work in both themes.
export const ICE_CARD = "bg-white/80 backdrop-blur-md border border-black/[0.08] rounded-2xl shadow-sm";
export const ICE_INSET = "bg-slate-50 border border-black/[0.06] rounded-xl";
export const CYAN_BUTTON =
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-[13px] font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
