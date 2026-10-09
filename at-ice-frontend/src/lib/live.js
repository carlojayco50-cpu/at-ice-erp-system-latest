import { useEffect, useState } from "react";
import { toast } from "./toast";

// Realtime notices for every flow (leave filed, delivery in transit, stock-out
// approved...). The backend writes one row per event (App\Support\LiveFeed);
// this polls GET /api/live-feed every few seconds while someone is signed in,
// pops up each new notice (toast.info) and tells the open page to reload its
// data (useLiveTick below). Started once from App.jsx.

const POLL_MS = 4000;        // tab in front
const POLL_HIDDEN_MS = 20000; // tab in the background

const listeners = new Set();
let lastId = null;
let lastToken = null;
let timer = null;

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
}

async function poll() {
  const token = localStorage.getItem("token");
  if (token !== lastToken) {
    // signed out, or another user signed in: start again from "now"
    lastToken = token;
    lastId = null;
  }
  if (!token || localStorage.getItem("must_change_password")) return schedule();

  try {
    const res = await fetch(`/api/live-feed${lastId === null ? "" : `?after=${lastId}`}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (lastId !== null) {
        for (const e of data.events || []) {
          toast.info(e.message);
          listeners.forEach((fn) => fn(e));
        }
      }
      lastId = data.last_id ?? lastId;
    }
  } catch {
    // offline or server restarting: try again next round
  }
  schedule();
}

export function startLiveFeed() {
  if (typeof document === "undefined" || document._liveFeed) return;
  document._liveFeed = true;
  // coming back to the tab: check right away instead of waiting
  document.addEventListener("visibilitychange", () => !document.hidden && schedule());
  poll();
}

export function subscribeLive(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Reloads the data of every page that uses useLiveTick (pull-to-refresh on
// the phone screens), without reloading the whole app.
export function refreshAll() {
  listeners.forEach((fn) => fn({ module: "*" }));
}

// A number that goes up whenever a live event for one of `modules` arrives
// ("*" = any). Put it in the deps of the effect that loads the page's data and
// the page reloads by itself:
//   const live = useLiveTick(["leave"]);
//   useEffect(() => { fetchAll(); }, [fetchAll, live]);
export function useLiveTick(modules) {
  const [tick, setTick] = useState(0);
  const key = modules.join(",");
  useEffect(() => {
    const wanted = key.split(",");
    return subscribeLive((e) => {
      if (wanted.includes("*") || e.module === "*" || wanted.includes(e.module)) setTick((t) => t + 1);
    });
  }, [key]);
  return tick;
}
