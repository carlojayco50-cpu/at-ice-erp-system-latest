import { useEffect, useState } from "react";
import { useLiveTick } from "./live";

// A Checker, Salesman, Maintenance employee or Driver can save nothing until
// they have timed in at the Attendance Station today (the server refuses with
// 403 "needs_time_in"). Pages use this to show the notice and disable their
// save buttons. null = still checking.
export function useTimedIn() {
  const [timedIn, setTimedIn] = useState(null);
  const live = useLiveTick(["attendance"]);

  useEffect(() => {
    let off = false;
    const check = async () => {
      try {
        const res = await fetch("/api/my-time-in", {
          headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!off) setTimedIn(!!data.timed_in);
      } catch {
        /* keep the last known state */
      }
    };
    check();
    // Re-check now and then so the notice clears soon after the kiosk Time In.
    const t = setInterval(check, 60000);
    window.addEventListener("focus", check);
    return () => {
      off = true;
      clearInterval(t);
      window.removeEventListener("focus", check);
    };
  }, [live]);

  return timedIn;
}
