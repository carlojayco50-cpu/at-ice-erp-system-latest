// Philippine (LTO) driver's license number, same rule as the server
// (app/Services/DriverLicense.php): N01-23-456789
//   N01     issuing LTO office: a letter and a two-digit office number (not 00)
//   23      year first issued
//   456789  serial number (not 000000)
// Only Drivers have one, and it must not have expired.

export const LICENSE_REGEX = /^[A-Z](?!00)\d{2}-\d{2}-(?!000000)\d{6}$/;
export const LICENSE_MESSAGE = "Use the LTO format: a letter and 10 digits, e.g. N01-23-456789.";
export const MAX_VALID_YEARS = 10;

// Formats as it is typed: "n0123456789" -> "N01-23-456789".
export function formatLicense(input) {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letter = /^[A-Z]/.test(raw) ? raw[0] : "";
  const digits = raw.slice(letter ? 1 : 0).replace(/\D/g, "").slice(0, 10);
  if (!letter) return digits ? digits : "";
  let out = letter + digits.slice(0, 2);
  if (digits.length > 2) out += "-" + digits.slice(2, 4);
  if (digits.length > 4) out += "-" + digits.slice(4);
  return out;
}

export function licenseError(value) {
  if (!value) return "";
  return LICENSE_REGEX.test(value) ? "" : LICENSE_MESSAGE;
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

export function expiryError(value) {
  if (!value) return "";
  if (value < tomorrowStr()) return "This license has expired. A Driver needs a valid license.";
  const max = new Date();
  max.setFullYear(max.getFullYear() + MAX_VALID_YEARS);
  if (value > ymd(max)) return "Check the expiry date: an LTO license is valid for at most 10 years.";
  return "";
}
