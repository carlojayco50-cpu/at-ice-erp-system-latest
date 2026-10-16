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
  { key: "late_delivery", label: "Late or Missed Delivery" },
  { key: "delivery_status", label: "Delivery Status & Schedule Confirmation" },
  { key: "wrong_quantity", label: "Wrong Quantity Delivered" },
  { key: "short_delivery", label: "Short Delivery (Fewer Sacks Than Invoiced)" },
  { key: "damaged_ice", label: "Damaged or Melted Ice" },
  { key: "ice_quality", label: "Ice Quality / Temperature Verification" },
  { key: "emergency_supply", label: "Emergency Ice Shortage / Urgent Additional Sacks" },
  { key: "new_order", label: "New Order Request" },
  { key: "cancel_order", label: "Cancel an Order or Delivery" },
  { key: "change_schedule", label: "Change Delivery Schedule" },
  { key: "billing", label: "Invoice or Billing Error" },
  { key: "payment_proof", label: "Payment Proof Follow-up" },
  { key: "price_inquiry", label: "Price Inquiry" },
  { key: "contract_rate", label: "Contract Rate or Volume Discount Review" },
  { key: "change_details", label: "Change Address or Contact Details" },
  { key: "staff_conduct", label: "Rude Driver or Salesman" },
  { key: "account_login", label: "Account or Login Problem" },
  { key: "feedback", label: "Feedback or Suggestion" },
  { key: "other", label: "Other" },
];

// Frosted ice card used across the customer portal. bg-white/90 is mapped to
// a dark surface by NightMode, so the same classes work in both themes.
export const ICE_CARD = "bg-white/80 backdrop-blur-md border border-black/[0.08] rounded-2xl shadow-sm";
export const ICE_INSET = "bg-slate-50 border border-black/[0.06] rounded-xl";
export const CYAN_BUTTON =
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-[13px] font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
