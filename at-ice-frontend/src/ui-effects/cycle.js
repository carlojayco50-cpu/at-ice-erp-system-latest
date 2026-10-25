// Tips and reminders widgets: a container with data-fx-cycle shows one child at
// a time and fades to the next every few seconds (pausing while hovered).
// Without the effects layer every tip is simply listed.

const EVERY = 5000;

function start(box) {
  if (box.dataset.fxCycling) return;
  box.dataset.fxCycling = "1";
  let i = 0;
  let hover = false;
  box.addEventListener("mouseenter", () => { hover = true; });
  box.addEventListener("mouseleave", () => { hover = false; });
  const show = () => {
    const items = [...box.children];
    items.forEach((el, j) => el.classList.toggle("fx-cycle-on", j === i % items.length));
  };
  show();
  const timer = setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    if (hover || box.children.length < 2) return;
    i += 1;
    show();
  }, EVERY);
}

export function startCycles() {
  const scan = () => document.querySelectorAll("[data-fx-cycle]").forEach(start);
  new MutationObserver(scan).observe(document.body, { subtree: true, childList: true });
  scan();
}
