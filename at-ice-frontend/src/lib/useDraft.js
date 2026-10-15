import { useCallback, useEffect, useMemo, useState } from "react";

// Form drafts that survive a page refresh (owner rule, 2026-10-16).
//
//   const draft = useDraft("customers:form", { open: false, editingId: null, form: EMPTY });
//   const { open, editingId, form } = draft.values;
//   const { open: setOpen, editingId: setEditingId, form: setForm } = draft.set;
//   draft.clear()   // on a successful submit and on Cancel / Discard
//   <DraftHint draft={draft} />   // "Draft restored · Discard"
//
// Each field works like useState (setter takes a value or an updater). The
// fields are saved in sessionStorage under "atice-draft:<user id>:<key>" and
// read back on the next load, so a refresh keeps what was typed (and a modal
// that was open opens again). The record being edited is one of the fields, so
// an Edit draft restores onto the same record. Nothing is saved while the
// values equal the initial ones or `when(values)` is false (e.g. the modal is
// closed). Passwords, PINs, tokens and File objects are never saved: files
// cannot be restored, the rest of the form is. clearSession() (lib/auth.js)
// removes every draft on logout.

const PREFIX = "atice-draft:";
const SECRET = /pass(word)?|^pin$|_pin$|pin_|token|secret/i;

function userId() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}")?.id ?? "guest";
  } catch {
    return "guest";
  }
}

const storageKey = (key) => `${PREFIX}${userId()}:${key}`;

// JSON without secrets or files (a File or Blob becomes "not set").
function serialize(value) {
  return JSON.stringify(value, (k, v) => {
    if (k && SECRET.test(k)) return undefined;
    if (typeof File !== "undefined" && v instanceof Blob) return undefined;
    return v;
  });
}

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Stored values over the initial ones, one level into objects, so a field
// that was not saved (a file, a password) keeps its initial value.
function merge(initial, stored) {
  const out = { ...initial };
  for (const k of Object.keys(initial)) {
    if (!(k in stored)) continue;
    out[k] = isPlain(initial[k]) && isPlain(stored[k]) ? { ...initial[k], ...stored[k] } : stored[k];
  }
  return out;
}

function read(key, initial) {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const stored = JSON.parse(raw);
    return isPlain(stored) ? merge(initial, stored) : null;
  } catch {
    return null;
  }
}

function write(key, values) {
  try {
    sessionStorage.setItem(storageKey(key), serialize(values));
  } catch {
    // Storage full or blocked: the form still works, it just is not kept.
  }
}

function remove(key) {
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

// Every draft of every user (logout).
export function clearAllDrafts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

// `key`: one per form, e.g. "customers:form". null turns saving off.
// `options.when(values)`: save only while this is true (default: always).
export function useDraft(key, initial, { when } = {}) {
  // The initial values are read once, like useState.
  const [initialValues] = useState(initial);
  const [state, setState] = useState(() => {
    const restored = key ? read(key, initialValues) : null;
    return { values: restored || initialValues, restored: !!restored };
  });
  // Read once too: it must only look at the values.
  const [whenFn] = useState(() => when);

  useEffect(() => {
    if (!key) return;
    const keep = whenFn ? whenFn(state.values) : true;
    const same = serialize(state.values) === serialize(initialValues);
    if (!keep || same) remove(key);
    else write(key, state.values);
  }, [key, state.values, initialValues, whenFn]);

  const set = useMemo(() => {
    const setters = {};
    for (const field of Object.keys(initialValues)) {
      setters[field] = (next) => setState((s) => {
        const value = typeof next === "function" ? next(s.values[field]) : next;
        if (value === s.values[field]) return s;
        const values = { ...s.values, [field]: value };
        // Once the form is closed the "restored" hint is done with.
        return { values, restored: s.restored && (!whenFn || whenFn(values)) };
      });
    }
    return setters;
  }, [initialValues, whenFn]);

  const clear = useCallback(() => {
    if (key) remove(key);
    setState({ values: initialValues, restored: false });
  }, [key, initialValues]);

  // Hide the "Draft restored" hint but keep the values.
  const dismiss = useCallback(() => setState((s) => (s.restored ? { ...s, restored: false } : s)), []);

  return { values: state.values, set, clear, dismiss, restored: state.restored };
}
