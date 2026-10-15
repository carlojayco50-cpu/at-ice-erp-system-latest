import { COMPANY } from "./company";
import { PRINT_BASE_CSS, printDocument } from "./printDocument";

// Prints a delivery invoice (Admin > Invoices and Customer > Invoices & Balance).
// It is a system copy for the customer, not a BIR official receipt, and says
// so on the page. Printed from a hidden iframe like the HR payslip, so no
// popup opens and the page itself is not affected.

const PRODUCT_LABEL = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };
const PAY_LABEL = { paid: "PAID", unpaid: "UNPAID", overdue: "OVERDUE" };
const MOP_LABEL = { cash: "Cash", gcash: "GCash", check: "Cheque", bank_transfer: "Bank Transfer" };

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—");

// receipt: a row from GET /api/receipts or /api/my-receipts (with items).
// customer: optional customer record when the receipt does not carry one.
export function printReceipt(receipt, customer) {
  const r = receipt || {};
  const c = r.customer || customer || {};
  const items = Array.isArray(r.items) && r.items.length
    ? r.items
    : [{ product_type: "ice", quantity: r.quantity, unit_price: r.unit_price, line_total: r.total_amount }];
  const status = r.payment_status || "unpaid";
  const address = [c.address, c.city, c.province].filter(Boolean).join(", ");

  const rows = items
    .map(
      (it) => `<tr>
        <td>${esc(PRODUCT_LABEL[it.product_type] || it.product_type || "Ice")}</td>
        <td class="num">${esc(it.quantity ?? "—")}${
          it.quantity_ordered != null && Number(it.quantity_ordered) !== Number(it.quantity)
            ? `<br><small>ordered ${esc(it.quantity_ordered)}</small>`
            : ""
        }</td>
        <td class="num">${esc(peso(it.unit_price))}</td>
        <td class="num">${esc(peso(it.line_total ?? Number(it.quantity || 0) * Number(it.unit_price || 0)))}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(r.receipt_no)}</title>
<style>
  ${PRINT_BASE_CSS}
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0e7490; padding-bottom: 10px; }
  .co { font-size: 16px; font-weight: 700; color: #0e7490; }
  .sub { color: #475569; font-size: 10.5px; margin-top: 3px; max-width: 360px; line-height: 1.4; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 18px; letter-spacing: 2px; color: #0e7490; }
  .title div { color: #334155; font-size: 11px; margin-top: 4px; }
  .stamp { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 2px solid; border-radius: 4px; font-weight: 700; letter-spacing: 1px; font-size: 11px; }
  .stamp.paid { color: #047857; border-color: #047857; }
  .stamp.unpaid { color: #b45309; border-color: #b45309; }
  .stamp.overdue { color: #b91c1c; border-color: #b91c1c; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0; }
  .info span { color: #64748b; display: inline-block; width: 92px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #334155; border-bottom: 1px solid #cbd5e1; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  .num { text-align: right; font-family: "Courier New", monospace; }
  .total { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; background: #ecfeff; border: 1px solid #a5f3fc; padding: 10px 12px; font-size: 14px; font-weight: 700; }
  .total .num { font-size: 16px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; }
  .sign div { border-top: 1px solid #0f172a; padding-top: 4px; text-align: center; font-size: 10.5px; color: #334155; }
  .notice { margin-top: 22px; color: #64748b; font-size: 10px; text-align: center; }
</style></head>
<body><div class="sheet">
  <div class="head">
    <div>
      <div class="co">${esc(COMPANY.name)}</div>
      <div class="sub">${esc(COMPANY.address)}<br>${esc(COMPANY.hotline)} · ${esc(COMPANY.email)}</div>
    </div>
    <div class="title">
      <h1>DELIVERY INVOICE</h1>
      <div>No. <strong>${esc(r.receipt_no || "—")}</strong></div>
      <div>Date: ${esc(day(r.created_at))}</div>
      <div class="stamp ${esc(status)}">${esc(PAY_LABEL[status] || status.toUpperCase())}</div>
    </div>
  </div>

  <div class="info">
    <div><span>Customer</span><strong>${esc(c.name || "—")}</strong></div>
    <div><span>Delivery No.</span>${esc(r.delivery?.delivery_no || "—")}</div>
    <div><span>Address</span>${esc(address || "—")}</div>
    <div><span>Delivered</span>${esc(day(r.delivery?.delivered_at || r.delivery?.scheduled_date || r.created_at))}</div>
    <div><span>Contact</span>${esc(c.contact_number || c.contact_person || "—")}</div>
    <div><span>Payment</span>${status === "paid" ? `${esc(MOP_LABEL[r.payment_method] || r.payment_method || "—")}, ${esc(day(r.paid_at))}` : "Not yet paid"}</div>
  </div>

  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total"><span>TOTAL</span><span class="num">${esc(peso(r.total_amount))}</span></div>

  <div class="sign">
    <div>Delivered by</div>
    <div>Received by (signature over printed name)</div>
  </div>

  <div class="notice">
    This is a system-generated delivery invoice for the customer's records. It is not an official receipt (BIR).<br>
    Printed ${esc(new Date().toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))} · AT-ICE ERP
  </div>
</div></body></html>`;

  printDocument(html);
}
