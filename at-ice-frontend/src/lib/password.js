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
