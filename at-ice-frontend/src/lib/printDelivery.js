import { formatDateTime } from "./time";
// Printable delivery confirmation for a Salesman-confirmed delivery: customer,
// items and quantities, date, driver, salesman and the proof. Printed from a
// hidden iframe with its own print CSS, so the page layout is not involved.

const PRODUCT_LABEL = { bags: "Bags (5kg)", small_sack: "Small Sack (30kg)", big_sack: "Big Sack (50kg)" };

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(v).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—");
const dateTime = (v) => (v ? formatDateTime(v) : "—");

function signedInName() {
  try { return JSON.parse(localStorage.getItem("user") || "{}")?.name || ""; } catch { return ""; }
}

// delivery: { delivery_no, scheduled_date, delivered_at, customer, driver, items }
// proof: { confirmed_at, quantity, notes, photo_path }, receipt: { receipt_no, items, total_amount, payment_status }
export function printDeliveryConfirmation({ delivery, proof, receipt, photoUrl, salesmanName }) {
  const ordered = {};
  for (const it of delivery?.items || []) ordered[it.product_type] = (ordered[it.product_type] || 0) + Number(it.quantity_ordered || 0);
  const delivered = receipt?.items || [];
  const types = [...new Set([...Object.keys(ordered), ...delivered.map((it) => it.product_type)])];

  const rows = types.map((t) => {
    const got = delivered.find((it) => it.product_type === t);
    return `<tr><td>${esc(PRODUCT_LABEL[t] || t)}</td><td class="n">${ordered[t] ?? "—"}</td><td class="n">${got ? got.quantity : 0}</td>`
      + `<td class="n">${got ? peso(got.unit_price) : "—"}</td><td class="n">${got ? peso(got.line_total) : "—"}</td></tr>`;
  }).join("");

  const c = delivery?.customer || {};
  const address = c.address || [c.street, c.barangay, c.city, c.province].filter(Boolean).join(", ") || "—";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Delivery ${esc(delivery?.delivery_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .muted { color: #555; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 14px; }
  .grid div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #eee; font-size: 11px; }
  td.n, th.n { text-align: right; }
  tfoot td { font-weight: bold; }
  .proof { display: flex; gap: 16px; align-items: flex-start; }
  .proof img { width: 220px; max-height: 220px; object-fit: cover; border: 1px solid #999; }
  .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; }
  .sign div { border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; }
</style></head><body>
<div class="head">
  <div><h1>AT Ice — Delivery Confirmation</h1><div class="muted">Proof of delivery confirmed by the Salesman</div></div>
  <div style="text-align:right"><div><b>${esc(delivery?.delivery_no || "")}</b></div>${receipt?.receipt_no ? `<div>Invoice ${esc(receipt.receipt_no)}</div>` : ""}</div>
</div>
<div class="grid">
  <div><span>Customer</span>${esc(c.name || "—")}${c.branch_code ? ` · ${esc(c.branch_code)}` : ""}</div>
  <div><span>Scheduled date</span>${esc(day(delivery?.scheduled_date))}</div>
  <div><span>Address</span>${esc(address)}</div>
  <div><span>Delivered / confirmed</span>${esc(dateTime(proof?.confirmed_at || delivery?.delivered_at))}</div>
  <div><span>Driver</span>${esc(delivery?.driver?.name || "—")}</div>
  <div><span>Salesman</span>${esc(salesmanName || signedInName() || "—")}</div>
</div>
<table>
  <thead><tr><th>Product</th><th class="n">Qty booked</th><th class="n">Qty delivered</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="5" class="muted">No items</td></tr>`}</tbody>
  ${receipt ? `<tfoot><tr><td colspan="4">Total${receipt.payment_status ? ` (${esc(receipt.payment_status)})` : ""}</td><td class="n">${peso(receipt.total_amount)}</td></tr></tfoot>` : ""}
</table>
<div class="proof">
  ${photoUrl ? `<img src="${esc(photoUrl)}" alt="Proof photo">` : `<div class="muted">No proof photo on file.</div>`}
  <div>
    <div><b>Proof of delivery</b></div>
    <div>Confirmed: ${esc(dateTime(proof?.confirmed_at || delivery?.delivered_at))}</div>
    ${proof?.quantity != null ? `<div>Total quantity: ${esc(proof.quantity)}</div>` : ""}
    ${proof?.notes ? `<div>Notes: ${esc(proof.notes)}</div>` : ""}
  </div>
</div>
<div class="sign"><div>Driver</div><div>Salesman</div><div>Received by (customer)</div></div>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for the photo so it is on the printout, then print and clean up.
  const go = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  };
  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.onload = go;
    img.onerror = go;
  } else {
    setTimeout(go, 50);
  }
}
