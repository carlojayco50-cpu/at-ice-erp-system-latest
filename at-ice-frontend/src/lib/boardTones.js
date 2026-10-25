import { PILL } from "./statusTones";

// The board palette. Each tone has a status pill (lib/statusTones.js, a soft
// pill like every other table badge, owner 2026-10-22), the group title color
// and the row edge color. Night mode gives the titles a lighter shade
// (index.css, "Board colors in night mode"), so the board reads the same in
// both themes (owner, 2026-10-20).
export const TONES = {
  done:    { pill: PILL.success, text: "text-[#047857]", edge: "#10b981" },
  // no orange (owner, 2026-10-17): in progress is the brand deep cyan
  working: { pill: PILL.progress, text: "text-[#0b5f76]", edge: "#0e7490" },
  // High priority: crimson on a soft pink
  high:    { pill: PILL.danger, text: "text-[#9f1239]", edge: "#be123c" },
  stuck:   { pill: PILL.danger, text: "text-[#b4233c]", edge: "#e2445c" },
  info:    { pill: PILL.info, text: "text-[#1f56b5]", edge: "#579bfc" },
  purple:  { pill: PILL.queued, text: "text-[#7a35b5]", edge: "#a25ddc" },
  idle:    { pill: PILL.neutral, text: "text-slate-500", edge: "#94a3b8" },
};
