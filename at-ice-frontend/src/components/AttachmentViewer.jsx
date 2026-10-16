import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { onPreview } from "../lib/preview";

// Every attachment opens here first, as a preview; "Open in new tab" and
// "Download" are the user's choice from there. Any link to an uploaded file
// (/storage/...) anywhere in the app is caught here, and private files
// (payment proofs, resumes, leave attachments) arrive through lib/preview.js.
// Pictures are shown full size and PDFs in a frame; other files (e.g. a Word
// resume) cannot be shown in the browser, so their name is shown with
// Download. Mounted once in App.jsx.

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i;
const PDF = /\.pdf(\?|#|$)/i;

const kindOf = ({ url, name, type }) => {
  if (/^image\//.test(type) || IMAGE.test(name) || IMAGE.test(url)) return "image";
  if (type === "application/pdf" || PDF.test(name) || PDF.test(url)) return "pdf";
  return "other";
};

export default function AttachmentViewer() {
  const [file, setFile] = useState(null);

  // Links to /storage/ files
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("data-no-preview")) return;
      const href = a.getAttribute("href");
      if (!href.includes("/storage/") && !a.hasAttribute("data-preview")) return;
      if (!IMAGE.test(href) && !PDF.test(href)) return;
      e.preventDefault();
      setFile({ url: a.href, name: decodeURIComponent(href.split(/[?#]/)[0].split("/").pop() || ""), type: "", revoke: false });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Files sent through lib/preview.js (a newer one replaces the one shown)
  useEffect(() => onPreview((next) => {
    setFile((prev) => {
      if (prev?.revoke) URL.revokeObjectURL(prev.url);
      return next;
    });
  }), []);

  const close = () => {
    setFile((prev) => {
      if (prev?.revoke) setTimeout(() => URL.revokeObjectURL(prev.url), 1000);
      return null;
    });
  };

  useEffect(() => {
    if (!file) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [file]);

  if (!file) return null;
  const kind = kindOf(file);
  const name = file.name || (kind === "pdf" ? "Document.pdf" : kind === "image" ? "Picture" : "File");
  const action = "flex h-10 items-center gap-1.5 rounded-xl bg-white/15 px-4 text-[13px] font-semibold text-white hover:bg-white/25";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
      onClick={close}
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-3 bg-black/75 p-4 pt-20 backdrop-blur-sm"
    >
      <div className="absolute left-4 right-4 top-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="mr-auto min-w-0 truncate text-[13px] font-medium text-white/90" title={name}>{name}</span>
        <a href={file.url} target="_blank" rel="noreferrer" data-no-preview className={action}>
          Open in new tab
        </a>
        <a href={file.url} download={file.name || true} data-no-preview className={action}>
          Download
        </a>
        <button type="button" aria-label="Close preview" onClick={close} autoFocus className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
          ✕
        </button>
      </div>
      {kind === "pdf" && (
        <iframe src={file.url} title={name} onClick={(e) => e.stopPropagation()} className="h-[85vh] w-full max-w-4xl rounded-xl bg-white" />
      )}
      {kind === "image" && (
        <img src={file.url} alt={name} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
      )}
      {kind === "other" && (
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 3v5h5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="truncate text-[14px] font-semibold text-slate-800" title={name}>{name}</div>
          <p className="mt-1 text-[12px] text-slate-500">This type of file cannot be shown in the browser. Download it to open it.</p>
          <a href={file.url} download={file.name || true} data-no-preview className="mt-4 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-cyan-600">
            Download
          </a>
        </div>
      )}
    </div>,
    document.body
  );
}
