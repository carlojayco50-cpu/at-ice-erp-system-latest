// A short burst of ice-colored confetti and a check mark after a major
// success: an invoice paid, a request approved or released, a delivery
// confirmed, a payroll or timesheet approved, an applicant hired. Ordinary
// saves get no burst.
import { subscribeToasts } from "../lib/toast";

const MAJOR = /\b(paid|approved|released|confirmed|delivered|hired|published)\b/i;
const COLORS = ["#06b6d4", "#22d3ee", "#67e8f9", "#10b981", "#a5f3fc", "#e0f2fe"];

export function celebrate(x = window.innerWidth / 2, y = 64) {
  const canvas = document.createElement("canvas");
  canvas.className = "fx-confetti";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  const parts = Array.from({ length: 70 }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -7 - 2,
    r: Math.random() * 3 + 2,
    c: COLORS[(Math.random() * COLORS.length) | 0],
    a: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.spin;
      g.save();
      g.globalAlpha = Math.max(0, 1 - t / 1400);
      g.translate(p.x, p.y);
      g.rotate(p.a);
      g.fillStyle = p.c;
      g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      g.restore();
    }
    if (t < 1400) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

export function startCelebrations() {
  subscribeToasts((t) => {
    if (t.type === "success" && MAJOR.test(t.text || "")) {
      // Let the toast appear first, then burst from it
      setTimeout(() => {
        const toastEl = document.querySelector(".soft-toasts > :last-child");
        const r = toastEl?.getBoundingClientRect();
        celebrate(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 2 : undefined);
        toastEl?.classList.add("fx-toast-pop");
      }, 120);
    }
  });
}
