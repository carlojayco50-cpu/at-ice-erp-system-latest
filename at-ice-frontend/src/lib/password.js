// Password rules for every place a password is set or changed. The backend enforces
// the same rules (Password::min(8)->mixedCase()->numbers()->symbols()).

export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
  { key: "symbol", label: "A special character (e.g. ! @ # $ %)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const isStrongPassword = (password) => PASSWORD_RULES.every((r) => r.test(password || ""));

export const PASSWORD_RULES_MESSAGE =
  "Password needs at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.";

// Password of a new employee account, made by the system (HR does not type
// one): last name + last two digits of the mobile number + "!".
// "Jayco" + 09171234550 -> "Jayco50!", "dela cruz" -> "DelaCruz50!".
// Same as EmployeeController::defaultPassword on the server. Returns "" until
// both the last name and at least two digits of the phone are filled in.
export function defaultEmployeePassword(lastName, phone) {
  const name = String(lastName || "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  const digits = String(phone || "").replace(/\D/g, "");
  if (!name || digits.length < 2) return "";
  return `${name}${digits.slice(-2)}!`;
}
