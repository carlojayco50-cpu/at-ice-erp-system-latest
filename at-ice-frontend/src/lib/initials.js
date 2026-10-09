// Up to two initials from a display name, e.g. "Juan Dela Cruz" -> "JD".
export function initialsOf(name, fallback = "BE") {
  return (name || "")
    .split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || fallback;
}
