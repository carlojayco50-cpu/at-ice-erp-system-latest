// The board palette. Each tone has the cell color (strong, white text) and
// the group title color. Every cell keeps white text at 4.5:1 or more, and
// night mode gives the titles a lighter shade (index.css, "Board colors in
// night mode"), so the board reads the same in both themes (owner, 2026-10-20).
export const TONES = {
  done:    { cell: "bg-[#047857] text-white", text: "text-[#047857]", edge: "#10b981" },
  // no orange (owner, 2026-10-17): in progress is the brand deep cyan
  working: { cell: "bg-[#0e7490] text-white", text: "text-[#0b5f76]", edge: "#0e7490" },
  // High priority: deep crimson on a soft pink
  high:    { cell: "bg-[#fde8ec] text-[#9f1239]", text: "text-[#9f1239]", edge: "#be123c" },
  stuck:   { cell: "bg-[#c62e47] text-white", text: "text-[#b4233c]", edge: "#e2445c" },
  info:    { cell: "bg-[#2f6fd6] text-white", text: "text-[#1f56b5]", edge: "#579bfc" },
  purple:  { cell: "bg-[#7e3fbf] text-white", text: "text-[#7a35b5]", edge: "#a25ddc" },
  idle:    { cell: "bg-[#e2e8f0] text-slate-700", text: "text-slate-500", edge: "#94a3b8" },
};
