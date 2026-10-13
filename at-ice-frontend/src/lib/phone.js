// Philippine phone numbers are stored with the +63 prefix, e.g. +639171234567.
// The forms show a fixed "+63" beside the input and edit only the digits after it.

export const PHONE_PREFIX = "+63";

// Mobile only: 10 digits starting with 9 (employees, applicants).
export const MOBILE_REGEX = /^9\d{9}$/;
export const MOBILE_MESSAGE = "Enter 10 digits starting with 9 (e.g. 9171234567).";

// Mobile or landline with area code: 9 to 10 digits (customers, suppliers).
export const ANY_REGEX = /^\d{9,10}$/;
export const ANY_MESSAGE = "Enter 9 to 10 digits. Landlines need the area code, without the 0 (e.g. 281234567).";

// Digits shown in the input for a stored value. Handles +63..., old 09... values
// and values with spaces or dashes.
export function localDigits(stored) {
  const v = String(stored || "").trim();
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (v.startsWith("+63")) return d.slice(2);
  if (v.startsWith("0")) return d.slice(1);
  return d;
}

// Most digits a valid number can have after +63. The forms reject anything longer.
export const PHONE_MAX_DIGITS = 10;

// Cleans what the user types or pastes into the input: digits only, no leading 0,
// no pasted 63 country code. It never cuts digits off the end: a number that is
// too long stays visible (up to a sanity cap of 15) and the form rejects it, so a
// digit can never be dropped silently. (A version that cut the number to 10 digits
// here lost the 11th digit typed without any message.) The input has no maxLength
// for the same reason.
export function typedDigits(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  else if (d.startsWith("63") && d.length > PHONE_MAX_DIGITS) d = d.slice(2);
  return d.slice(0, 15);
}

// Value to send to the API, e.g. "9171234567" -> "+639171234567" (empty stays empty).
export function toStoredPhone(digits) {
  return digits ? PHONE_PREFIX + digits : "";
}
