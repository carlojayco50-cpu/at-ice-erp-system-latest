import { PILL } from "./statusTones";

// The one payment badge of an invoice row (Admin > Invoices, Customer >
// Invoices). Exactly one state per row, in this order:
//   paid      payment_status is paid (Admin marked it paid or approved a
//             proof). The only green badge.
//   review    the latest payment proof is waiting for Admin
//   rejected  the latest proof was rejected: the customer uploads a new one
//   overdue   unpaid past the due days
//   unpaid
// "Paid" and "Proof rejected" are never shown together. Colors from
// lib/statusTones.js.
export const PAYMENT_BADGE = {
  paid: { label: "Paid", cls: PILL.success },
  review: { label: "Proof to review", cls: PILL.info },
  rejected: { label: "Rejected", cls: PILL.danger },
  overdue: { label: "Overdue", cls: PILL.danger },
  unpaid: { label: "Unpaid", cls: PILL.warning },
};

export function paymentState(receipt, hasPendingProof = false) {
  if (!receipt) return "unpaid";
  if (receipt.payment_status === "paid") return "paid";
  const latest = (receipt.payment_proofs || [])[0];
  if (hasPendingProof || latest?.status === "pending") return "review";
  if (latest?.status === "rejected") return "rejected";
  return receipt.payment_status === "overdue" ? "overdue" : "unpaid";
}
