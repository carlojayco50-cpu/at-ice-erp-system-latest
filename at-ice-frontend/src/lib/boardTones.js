// The board palette. Each tone has the cell color (strong, white text) and
// the group title color. Same colors in light and night mode.
export const TONES = {
  done:    { cell: "bg-[#00c875] text-white", text: "text-[#00a35f]", edge: "#00c875" },
  // no orange (owner, 2026-10-17): in progress is the brand deep cyan
  working: { cell: "bg-[#0e7490] text-white", text: "text-[#0e7490]", edge: "#0e7490" },
  // High priority: deep crimson on a soft pink
  high:    { cell: "bg-[#fde8ec] text-[#9f1239]", text: "text-[#9f1239]", edge: "#be123c" },
  stuck:   { cell: "bg-[#e2445c] text-white", text: "text-[#d83a52]", edge: "#e2445c" },
  info:    { cell: "bg-[#579bfc] text-white", text: "text-[#3a7fe0]", edge: "#579bfc" },
  purple:  { cell: "bg-[#a25ddc] text-white", text: "text-[#8b44c7]", edge: "#a25ddc" },
  idle:    { cell: "bg-[#c4c4c4] text-white", text: "text-slate-500", edge: "#c4c4c4" },
};
