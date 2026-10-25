// Which buttons ask "are you sure?" first, and the short reminder each action
// button shows on hover (owner, 2026-10-20: every action is confirmed so a
// misclick changes nothing, and every action button says what it does).
// Used by components/ActionGuard.jsx, which works on the rendered buttons of
// every page, so pages need no changes. A page can still steer it:
//   data-confirm="Message"   always confirm, with this message
//   data-confirm-title="…"   the dialog title (default: the button's label + ?)
//   data-no-confirm          never confirm (the button opens its own dialog)
//   data-tip="…"             the hover reminder (title="…" works too)

// Pages where a confirmation would only get in the way
const SKIP_PATHS = ["/attendance-station", "/login", "/forgot-password", "/reset-password"];

// A label that starts with one of these whole words ("Approved" or
// "Rejected" is a filter, not the verb)
const w = (words) => new RegExp(`^(${words})(?![a-z])`);

// Verbs (start of the button's label) that change records
const DANGER = w("delete|remove|deactivate|anonymize|discard|reject|cancel request|cancel movement|cancel delivery|end assignment|sign out other");
const ACTION = w("approve|release|hire|mark|reactivate|use reference|apply to all|unlock|re-enroll|resend|regenerate|restore|reopen|close ticket");
// Saving a form (only its submit, or the main button of a form dialog)
const SAVE = w("save|update|create|submit|add|send|upload|request|log|file|book|set|change|post|apply|generate|approve");

const CONSEQUENCE = [
  [w("delete|remove"), "It is taken off the list."],
  [w("deactivate"), "It stays in the records and can be reactivated later."],
  [w("reactivate"), "It becomes active again with the same ID."],
  [w("anonymize"), "Names and contact details are removed for good."],
  [w("discard"), "What you typed is thrown away."],
  [w("reject"), "The request is turned down."],
  [w("cancel"), "It is cancelled and cannot be resumed."],
  [w("approve"), "It is approved and the next step starts."],
  [w("release"), "The items are taken out of stock."],
  [w("hire"), "The applicant becomes an employee."],
  [/^mark .*paid/, "Paid is final and cannot be undone."],
  [w("mark"), "The status changes right away."],
  [w("use reference|apply to all"), "Prices go back to the reference prices of the type."],
  [w("unlock"), "The device can be used again."],
  [w("sign out other"), "Every other device is signed out."],
  [w("save|update|change|set"), "Your changes are saved."],
  [w("create|add|submit|request|log|file|book|post|generate|send|upload|apply"), "It is saved and sent right away."],
];

// The hover reminder for a label (null: none)
const TIPS = [
  [w("view|open|preview|details"), "Opens the details. Nothing is changed."],
  [w("edit"), "Opens a form to change this record."],
  [w("delete|remove|×|✕"), "Removes this. You are asked to confirm first."],
  [w("deactivate"), "Deactivates this record (kept in history). You are asked to confirm."],
  [w("reactivate"), "Brings this record back. You are asked to confirm."],
  [w("approve"), "Approves this. You are asked to confirm first."],
  [w("reject"), "Turns this down. You are asked to confirm first."],
  [w("release"), "Releases the items from stock. You are asked to confirm."],
  [/^mark .*paid/, "Records the payment as final. You are asked to confirm."],
  [w("mark"), "Changes the status. You are asked to confirm first."],
  [w("hire"), "Hires the applicant. You are asked to confirm first."],
  [w("cancel"), "Cancels without saving."],
  [w("close|done|back|keep"), "Closes this without changing anything."],
  [w("save|update"), "Saves your changes. You are asked to confirm first."],
  [w("new|\\+|add|create"), "Opens a form to add a new one."],
  [w("print|payslip"), "Opens a printable copy."],
  [w("csv|pdf|download|export"), "Downloads a copy of this list."],
  [w("previous|‹"), "Shows the previous page."],
  [w("next|›"), "Shows the next page."],
  [w("today|this month"), "Jumps to the current date."],
  [w("clear filters|clear"), "Clears the filters and shows everything."],
  [w("retry|try again"), "Tries again."],
  [w("use reference"), "Removes this customer's own prices. You are asked to confirm."],
  [w("apply to all"), "Gives every customer of this type the reference prices. You are asked to confirm."],
  [w("copy"), "Copies it to the clipboard."],
  [w("sign out|log out"), "Signs you out of this device."],
];

export const labelOf = (el) =>
  (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();

// "+ Add item" -> "add item", "✕ Remove" -> "remove"
const verbOf = (el) => labelOf(el).toLowerCase().replace(/^[+✕×]\s*(?=\S)/, "");

function modalOf(el) {
  return el.closest('[role="dialog"], [role="alertdialog"], .fixed.inset-0');
}
const FIELDS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="search"]), textarea, select';

// The record a button acts on: the first cells of its table row, or the
// title of its card, so the dialog says what is affected.
function contextOf(el) {
  const row = el.closest("tr");
  if (row) {
    const cells = [...row.cells].filter((c) => !c.querySelector("button, input") && c.textContent.trim());
    return cells.slice(0, 2).map((c) => c.textContent.replace(/\s+/g, " ").trim()).join(" · ").slice(0, 80);
  }
  const card = el.closest("li, article, [data-confirm-label], .rounded-xl, .rounded-2xl");
  if (card && !modalOf(card)?.isSameNode(card)) {
    if (card.dataset.confirmLabel) return card.dataset.confirmLabel;
    const head = card.querySelector("h2, h3, h4, .font-semibold, strong, b");
    if (head && !head.contains(el)) return head.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  return "";
}

// null, or what the confirmation says: { title, message, confirmLabel, danger }
export function confirmationFor(el) {
  if (!el || el.disabled || el.closest("[data-no-confirm], .guard-host")) return null;
  // tabs, filters and toggles only change what is shown
  if (el.getAttribute("role") === "tab" || ["aria-selected", "aria-pressed", "aria-expanded"].some((a) => el.hasAttribute(a))) return null;
  if (SKIP_PATHS.some((p) => window.location.pathname.startsWith(p))) return null;

  const label = labelOf(el);
  const verb = verbOf(el);
  const explicit = el.getAttribute("data-confirm");
  let wanted = explicit != null;

  if (!wanted) {
    if (!verb || /^confirm/.test(verb)) return null; // already a confirmation
    const modal = modalOf(el);
    const form = el.closest("form");
    const isSubmit = el.type === "submit" && !!form;
    if (modal) {
      // A dialog without fields is itself a confirmation. In a form dialog
      // only the button that saves it is confirmed.
      if (!modal.querySelector(FIELDS)) return null;
      wanted = (isSubmit || !form) && SAVE.test(verb) && !el.closest("li, tr");
    } else if (form) {
      // Inside a form only its submit is confirmed (removing a line while
      // filling it in changes nothing yet).
      wanted = isSubmit && (SAVE.test(verb) || ACTION.test(verb));
    } else {
      wanted = DANGER.test(verb) || ACTION.test(verb);
    }
  }
  if (!wanted) return null;

  const context = contextOf(el);
  const consequence = CONSEQUENCE.find(([re]) => re.test(verb))?.[1] || "This cannot be undone by clicking again.";
  return {
    title: el.getAttribute("data-confirm-title") || `${label.replace(/[.…]+$/, "")}?`,
    message: explicit || consequence,
    context: explicit ? "" : context,
    confirmLabel: label.length > 28 ? "Yes, continue" : label,
    danger: DANGER.test(verb),
  };
}

// The hover reminder of a button or link that acts like one (null: none)
export function tipFor(el) {
  const own = el.getAttribute("data-tip");
  if (own) return own;
  const verb = verbOf(el);
  const tip = TIPS.find(([re]) => re.test(verb))?.[1];
  if (tip) return tip;
  // an icon-only button names itself in aria-label
  return !el.textContent.trim() ? el.getAttribute("aria-label") : null;
}
