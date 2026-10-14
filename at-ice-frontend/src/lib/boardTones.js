// The board palette. Each tone has the cell color (strong, white text) and
// the group title color. Same colors in light and night mode.
export const TONES = {
  done:    { cell: "bg-[#00c875] text-white", text: "text-[#00a35f]", edge: "#00c875" },
  working: { cell: "bg-[#fdab3d] text-white", text: "text-[#d4861c]", edge: "#fdab3d" },
  stuck:   { cell: "bg-[#e2445c] text-white", text: "text-[#d83a52]", edge: "#e2445c" },
  info:    { cell: "bg-[#579bfc] text-white", text: "text-[#3a7fe0]", edge: "#579bfc" },
  purple:  { cell: "bg-[#a25ddc] text-white", text: "text-[#8b44c7]", edge: "#a25ddc" },
  idle:    { cell: "bg-[#c4c4c4] text-white", text: "text-slate-500", edge: "#c4c4c4" },
};
