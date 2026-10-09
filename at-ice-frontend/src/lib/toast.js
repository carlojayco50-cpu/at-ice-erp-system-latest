// Pop-up notice at the top center of the screen (components/Toaster.jsx shows it).
// Call it after every add or remove, e.g. toast.success("Employee added.").

const listeners = new Set();
let nextId = 1;

function show(type, text) {
  const t = { id: nextId++, type, text };
  listeners.forEach((fn) => fn(t));
}

export const toast = {
  success: (text) => show("success", text),
  error: (text) => show("error", text),
  info: (text) => show("info", text),
};

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
