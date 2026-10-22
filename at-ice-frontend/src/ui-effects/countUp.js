// Numbers that count up: any element with data-fx-count="<number>" (KpiCard
// sets it) animates from its last value (0 the first time it is seen) to the
// new one. The text React wrote is the final text, so prefixes, suffixes,
// separators and decimals ("₱2,600.00", "93%", "1,204") come out exactly right.

const DURATION = 900;
const last = new WeakMap();

function animate(el) {
  const to = Number(el.dataset.fxCount);
  if (!Number.isFinite(to)) return;
  const final = el.textContent;
  const from = last.has(el) ? last.get(el) : 0;
  last.set(el, to);
  if (from === to) return;
  // "₱2,600.00" -> prefix "₱", number "2,600.00", suffix ""
  const m = final.match(/^(\D*?)(-?[\d,]*\.?\d+)(.*)$/s);
  if (!m) return;
  const [, prefix, numText, suffix] = m;
  const decimals = (numText.split(".")[1] || "").length;
  const grouped = numText.includes(",");
  const fmt = (n) => {
    const fixed = n.toFixed(decimals);
    if (!grouped) return fixed;
    const [i, d] = fixed.split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? `.${d}` : "");
  };
  const start = performance.now();
  const step = (now) => {
    if (el.dataset.fxCount !== String(to)) return; // a newer value took over
    const t = Math.min(1, (now - start) / DURATION);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = t < 1 ? `${prefix}${fmt(from + (to - from) * eased)}${suffix}` : final;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function startCountUp() {
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        seen.unobserve(e.target);
        animate(e.target);
      }
    }
  });
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches?.("[data-fx-count]") && !last.has(root)) seen.observe(root);
    root.querySelectorAll?.("[data-fx-count]").forEach((el) => { if (!last.has(el)) seen.observe(el); });
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes" && last.has(r.target)) animate(r.target);
      r.addedNodes.forEach(scan);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-fx-count"] });
  scan(document.body);
}
