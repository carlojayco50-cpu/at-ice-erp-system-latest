import { LOGIN_PATH, clearSession } from "./auth";

// One global wrapper around fetch: when a request to our own API comes back 401
// (the token expired or was revoked), the session is cleared and the user is sent
// to the login page with a short message. No individual fetch call needs changing.

export const SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";
const NOTICE_KEY = "session_expired_notice";

// Returns the message once, then forgets it.
export function takeSessionExpiredNotice() {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return notice || "";
  } catch {
    return "";
  }
}

// A 401 on these is not an expired session:
//   - the login request itself (a wrong password must only show an error on the form)
//   - logout
//   - the Attendance Station kiosk routes: the kiosk has its own token (X-Kiosk-Token),
//     and a kiosk failure is never a user session ending
function isIgnored(pathname, method) {
  if (pathname === "/api/login" || pathname === "/api/logout") return true;
  if (pathname.startsWith("/api/kiosk/")) return true;
  if (pathname === "/api/face-descriptors") return true;
  if (pathname === "/api/attendances" && method === "POST") return true; // HR's GET list is protected
  return false;
}

// True when the request carries the kiosk token header.
function hasKioskHeader(input, init) {
  const sources = [init?.headers, typeof input === "object" && !(input instanceof URL) ? input.headers : null];
  return sources.some((h) => {
    if (!h) return false;
    if (typeof h.has === "function") return h.has("X-Kiosk-Token");
    if (Array.isArray(h)) return h.some(([name]) => String(name).toLowerCase() === "x-kiosk-token");
    return Object.keys(h).some((name) => name.toLowerCase() === "x-kiosk-token");
  });
}

let redirecting = false;

// Called with the address and method of a request that came back 401. Ends the
// session and goes to the login page, unless the request is one that is ignored
// (see isIgnored), carries the kiosk token, or nobody is signed in. Shared by the
// fetch wrapper below and by XMLHttpRequest uploads (lib/upload.js), which fetch
// never sees.
export function handleUnauthorized(rawUrl, method = "GET", kiosk = false) {
  if (redirecting) return;

  try {
    const url = new URL(rawUrl, window.location.origin);

    const isOurApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
    // Only when someone is signed in: nothing to expire otherwise.
    if (!isOurApi || isIgnored(url.pathname, String(method).toUpperCase()) || kiosk || !localStorage.getItem("token")) {
      return;
    }

    redirecting = true;
    clearSession();
    try {
      sessionStorage.setItem(NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
    } catch {
      // the redirect still happens without the message
    }
    // Already on the login page: it shows the message itself, no reload needed.
    if (window.location.pathname !== LOGIN_PATH) {
      window.location.assign(LOGIN_PATH);
    } else {
      redirecting = false;
    }
  } catch {
    // never break the original response because of this check
  }
}

export function installSessionExpiryHandler() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);

    if (response.status !== 401 || redirecting) return response;

    try {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = String(init?.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
      handleUnauthorized(rawUrl, method, hasKioskHeader(input, init));
    } catch {
      // never break the original response because of this check
    }

    return response;
  };
}
