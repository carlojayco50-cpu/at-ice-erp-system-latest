// Countdown for the sign-in lockout. The server decides and enforces it
// (App\Services\LoginLockout); this only shows what the server said.
//
// When the login API answers 429 it sends retry_after_seconds, counted on the
// server's clock. The page turns that into an end time on its own clock once, then
// counts down to it, so a wrong computer clock cannot stretch or cut the wait.
// The end time and the email are kept in localStorage so a refresh or another tab
// shows the same countdown. A lock belongs to one email: typing a different email
// is not blocked here (the server decides that on the next try).

import { useEffect, useState } from "react";

const KEY = "atice-login-lock";

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && v.until > Date.now() && v.email ? v : null;
  } catch {
    return null;
  }
};

// "2:41" for 161 seconds
export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// The email a lock was set for, so the form can be filled in again after a refresh.
export const lockedEmail = () => read()?.email || "";

export function useLoginLock(email) {
  const [lock, setLock] = useState(read);
  const [now, setNow] = useState(() => Date.now());

  // follow the lock from another tab
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setLock(read()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // tick once a second while a lock is showing; clear it when it ends
  useEffect(() => {
    if (!lock) return undefined;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (lock.until <= Date.now()) {
        try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
        setLock(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lock]);

  const mine = lock && lock.email === email.trim().toLowerCase();
  const seconds = mine ? Math.max(0, Math.ceil((lock.until - now) / 1000)) : 0;

  return {
    locked: seconds > 0,
    seconds,
    // call with the 429 body
    start(retryAfterSeconds) {
      const next = { until: Date.now() + retryAfterSeconds * 1000, email: email.trim().toLowerCase() };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      setNow(Date.now());
      setLock(next);
    },
  };
}
