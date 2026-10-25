// A sliding active pill for tab and segmented groups: a container with
// data-fx-tabs whose buttons/links mark the current one with aria-pressed,
// aria-selected or aria-current. The pill glides to the newly chosen item
// instead of the highlight jumping.

const PILL = "fx-tab-pill";

function activeIn(group) {
  return group.querySelector(":scope > :is([aria-pressed='true'], [aria-selected='true'], [aria-current]:not([aria-current='false'])), :scope > * > :is([aria-pressed='true'], [aria-selected='true'], [aria-current]:not([aria-current='false']))");
}

function place(group) {
  let pill = group.querySelector(`:scope > .${PILL}`);
  const active = activeIn(group);
  if (!active) {
    pill?.remove();
    return;
  }
  if (!pill) {
    pill = document.createElement("span");
    pill.className = PILL;
    pill.setAttribute("aria-hidden", "true");
    group.prepend(pill);
    pill.dataset.fresh = "1";
  }
  if (getComputedStyle(group).position === "static") group.style.position = "relative";
  const g = group.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  pill.style.width = `${a.width}px`;
  pill.style.height = `${a.height}px`;
  pill.style.transform = `translate(${a.left - g.left + group.scrollLeft}px, ${a.top - g.top + group.scrollTop}px)`;
  pill.style.borderRadius = getComputedStyle(active).borderRadius;
  if (pill.dataset.fresh) requestAnimationFrame(() => { delete pill.dataset.fresh; });
}

export function startTabIndicators() {
  const all = () => document.querySelectorAll("[data-fx-tabs]").forEach(place);
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(all);
  };
  new MutationObserver(later).observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["aria-pressed", "aria-selected", "aria-current", "class"],
  });
  window.addEventListener("resize", later);
  later();
}
