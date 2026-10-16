// Every attachment opens in a preview first (components/AttachmentViewer.jsx,
// mounted once in App.jsx); from there the user may open it in a new tab or
// download it. Links to /storage/ files are caught by the viewer itself;
// everything else calls one of these.

const EVENT = "atice:preview";

// Shows a file in the preview. `url` may be a normal or a blob: URL; with
// `revoke` the blob URL is released when the preview closes.
export function previewFile({ url, name = "", type = "", revoke = false }) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { url, name, type, revoke } }));
}

export function onPreview(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// Fetches a private file from an API route that needs the login token (a med
// cert, a resume, a payment proof) and previews it. Throws with a message the
// caller can show when the file cannot be fetched.
export async function previewProtectedFile(url, name = "") {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
  if (!res.ok) throw new Error(res.status === 404 ? "The file is missing." : "The file could not be opened.");
  const blob = await res.blob();
  previewFile({ url: URL.createObjectURL(blob), name: name || fileNameFrom(res), type: blob.type, revoke: true });
}

// A file the user picked but has not uploaded yet.
export function previewLocalFile(file) {
  previewFile({ url: URL.createObjectURL(file), name: file.name, type: file.type, revoke: true });
}

function fileNameFrom(res) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") || "");
  return m ? decodeURIComponent(m[1]) : "";
}
