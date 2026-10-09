// Every text field in the app starts with a capital letter: typing "juan"
// gives "Juan". Installed once in main.jsx, so no form needs its own code.
//
// Skipped: email, password, URL, number and other non-text inputs, fields
// whose name, id, placeholder or autocomplete is about an email, username,
// link or password, read-only fields, and anything inside [data-no-caps].
//
// How it works with React: a capture listener on window runs before React's
// own input listener. It writes the new value with the native value setter,
// which bypasses React's value tracker, so React still sees a change and its
// onChange receives the capitalized value.

const SKIP_HINT = /e-?mail|@|user ?name|username|password|link|url|http/i;

const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;

function shouldCapitalize(el) {
  if (el instanceof HTMLTextAreaElement) {
    // a textarea has no type; it only needs the other checks
  } else if (!(el instanceof HTMLInputElement) || (el.type !== "text" && el.type !== "")) {
    return false;
  }
  if (el.readOnly || el.disabled || el.closest("[data-no-caps]")) return false;
  if (["email", "url", "numeric", "decimal", "tel"].includes(el.inputMode)) return false;
  const hints = [el.name, el.id, el.placeholder, el.getAttribute("autocomplete") || ""].join(" ");
  return !SKIP_HINT.test(hints);
}

export function installAutoCapitalize() {
  window.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (e.isComposing || !shouldCapitalize(el)) return;
      const v = el.value;
      if (!v) return;
      const first = v[0].toUpperCase();
      if (first === v[0]) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      (el instanceof HTMLTextAreaElement ? textareaSetter : inputSetter).call(el, first + v.slice(1));
      try { el.setSelectionRange(start, end); } catch { /* not every input keeps a caret */ }
    },
    true,
  );
}
