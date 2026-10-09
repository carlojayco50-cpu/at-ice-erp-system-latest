// Shared printing for the receipt, payslips and payroll slips.
//
// Works on any paper size and any margin setting in the print dialog:
//   - no fixed @page size, so the page follows the paper the user picks
//     (A4, Letter, Legal, A5, short bond, 80 mm receipt rolls...)
//   - @page margin 0 plus padding on .sheet, so the document keeps its own
//     white border even with "Margins: None" and is never cut at the edge
//   - narrow paper (A5 and smaller) stacks the two-column parts
//   - colors and the status stamp print without "Background graphics"
// Each document puts PRINT_BASE_CSS first in its <style> and its content in
// <div class="sheet">.

export const PRINT_BASE_CSS = `
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-wrap: anywhere; }
  .sheet { width: 100%; padding: 14mm 14mm 12mm; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr, .total, .net, .sign { break-inside: avoid; }
  .head { gap: 12px; }
  .head > div:first-child { min-width: 0; }
  .title { flex-shrink: 0; }

  /* A5 and other narrow paper: one column, smaller border */
  @media (max-width: 160mm) {
    .sheet { padding: 8mm 8mm 7mm; }
    body { font-size: 11px !important; }
    .head { flex-direction: column; }
    .title { text-align: left !important; }
    .info { grid-template-columns: 1fr !important; }
    .sign { grid-template-columns: 1fr !important; gap: 28px !important; }
  }

  /* Receipt rolls (about 80 mm or less) */
  @media (max-width: 95mm) {
    .sheet { padding: 3mm; }
    body { font-size: 10px !important; }
    .title h1 { font-size: 14px !important; letter-spacing: 1px !important; }
    .info span { width: auto !important; margin-right: 6px; }
    th, td { padding: 3px 4px !important; }
  }
`;

// Prints a full HTML document from a hidden iframe: no popup window, and the
// page underneath is not affected.
export function printDocument(html) {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(cleanup, 60000); // fallback if onafterprint does not fire
  }, 250);
}
