// Every <textarea> in the app grows with its text while typing (no inner
// scrollbar) and shrinks back when text is removed. Its `rows` stays the
// smallest height; past 60% of the screen it scrolls inside instead.
// Installed once in main.jsx, so no form needs its own code. Skip one with
// data-no-autogrow.
//
// A form that clears the text after sending (React sets the value, no input
// event) is caught by a light check every 400 ms on the textareas that grew.

const MAX_SHARE_OF_SCREEN = 0.6;
const grown = new Set();

function fit(el) {
  if (!(el instanceof HTMLTextAreaElement) || el.closest("[data-no-autogrow]")) return;
  const style = getComputedStyle(el);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const max = window.innerHeight * MAX_SHARE_OF_SCREEN;
  el.style.height = "auto"; // back to the rows height, so it can also shrink
  const wanted = el.scrollHeight + borders;
  el.style.height = `${Math.min(wanted, max)}px`;
  el.style.overflowY = wanted > max ? "auto" : "hidden";
  el.dataset.autogrowLength = String(el.value.length);
  if (el.style.height !== "") grown.add(el);
}

export function installAutoGrow() {
  document.addEventListener("input", (e) => fit(e.target), true);
  document.addEventListener("focusin", (e) => fit(e.target), true);

  setInterval(() => {
    for (const el of grown) {
      if (!el.isConnected) { grown.delete(el); continue; }
      if (el.dataset.autogrowLength !== String(el.value.length)) fit(el);
    }
  }, 400);
}
