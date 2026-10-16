// Employee names with the optional middle initial and suffix.
// The API also sends `full_name` (built the same way in Employee::composeName).

import { formatShift } from "./time";

export const NAME_SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"];

const initial = (mi) => (mi ? `${String(mi).toUpperCase()}.` : "");

// "Juan D. Dela Cruz Jr."
export function fullName(e) {
  if (!e) return "";
  return [e.first_name, initial(e.middle_initial), e.last_name, e.suffix].filter(Boolean).join(" ");
}

// "Dela Cruz Jr., Juan D." (for lists sorted by last name)
export function lastFirstName(e) {
  if (!e) return "";
  const last = [e.last_name, e.suffix].filter(Boolean).join(" ");
  const first = [e.first_name, initial(e.middle_initial)].filter(Boolean).join(" ");
  return [last, first].filter(Boolean).join(", ");
}

// A shift as hours: "9:00 AM – 6:00 PM", or "9:00 PM – 6:00 AM (next day)" overnight.
export function shiftLabel(e) {
  return formatShift(e?.shift_start, e?.shift_end) || (e?.shift === "night" ? "Night" : e?.shift ? "Day" : "—");
}

// Middle initial as typed: letters only, upper case, at most two ("d." -> "D")
export const cleanInitial = (v) => String(v || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
