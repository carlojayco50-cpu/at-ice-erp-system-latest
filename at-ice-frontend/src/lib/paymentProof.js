import { previewProtectedFile } from "./preview";

// Customer proof of payment for an invoice (PaymentProof on the backend).
// The file is private: it is fetched with the login token and previewed.

// Keys match PaymentProof::METHODS.
export const PROOF_METHODS = {
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank Transfer",
  check: "Cheque",
  cash: "Cash",
  other: "Other",
};

export const PROOF_STATUS = {
  pending: { label: "Under review", cls: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  rejected: { label: "Rejected", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
};

// Photo or PDF, up to 5 MB (PaymentProof::FILE_RULE).
export const PROOF_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

// Shows the file at `url` (an authenticated API route) in the attachment
// preview; from there it can be opened in a new tab or downloaded.
export async function openProofFile(url, name = "") {
  try {
    await previewProtectedFile(url, name);
  } catch {
    throw new Error("Couldn't open the file.");
  }
}
