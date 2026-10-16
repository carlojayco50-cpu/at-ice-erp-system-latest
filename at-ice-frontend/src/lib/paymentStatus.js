// The one payment badge of an invoice row (Admin > Invoices, Customer >
// Invoices). Exactly one state per row, in this order:
//   paid      payment_status is paid (Admin marked it paid or approved a
//             proof). The only state with the solid green badge.
//   review    the latest payment proof is waiting for Admin
//   rejected  the latest proof was rejected: the customer uploads a new one
//   overdue   unpaid past the due days
//   unpaid
// "Paid" and "Proof rejected" are never shown together.
export const PAYMENT_BADGE = {
  paid: { label: "Paid", cls: "bg-[#00a35f] text-white border-[#00a35f]" },
  review: { label: "Proof to review", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-800 border-red-200" },
  overdue: { label: "Overdue", cls: "bg-[#fde8ec] text-[#9f1239] border-[#fbcfd8]" },
  unpaid: { label: "Unpaid", cls: "bg-amber-50 text-amber-800 border-amber-200" },
};

export function paymentState(receipt, hasPendingProof = false) {
  if (!receipt) return "unpaid";
  if (receipt.payment_status === "paid") return "paid";
  const latest = (receipt.payment_proofs || [])[0];
  if (hasPendingProof || latest?.status === "pending") return "review";
  if (latest?.status === "rejected") return "rejected";
  return receipt.payment_status === "overdue" ? "overdue" : "unpaid";
}
