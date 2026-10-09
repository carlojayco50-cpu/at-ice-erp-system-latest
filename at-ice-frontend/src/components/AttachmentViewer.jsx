import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Attachments open in a pop-up instead of a new tab. Any link to an uploaded
// file (/storage/...) anywhere in the app is caught here: pictures are shown
// full size, PDFs in a frame, anything else still opens in a new tab.
// Mounted once in App.jsx.

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i;
const PDF = /\.pdf(\?|#|$)/i;

export default function AttachmentViewer() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("data-no-preview")) return;
      const href = a.getAttribute("href");
      if (!href.includes("/storage/") && !a.hasAttribute("data-preview")) return;
      if (!IMAGE.test(href) && !PDF.test(href)) return;
      e.preventDefault();
      setUrl(a.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!url) return;
    const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), setUrl(null));
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [url]);

  if (!url) return null;
  const isPdf = PDF.test(url);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attachment"
      onClick={() => setUrl(null)}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          data-no-preview
          className="flex h-10 items-center rounded-xl bg-white/15 px-4 text-[13px] font-semibold text-white hover:bg-white/25"
        >
          Open in new tab
        </a>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setUrl(null)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"
        >
          ✕
        </button>
      </div>
      {isPdf ? (
        <iframe
          src={url}
          title="Attachment"
          onClick={(e) => e.stopPropagation()}
          className="h-[85vh] w-full max-w-4xl rounded-xl bg-white"
        />
      ) : (
        <img
          src={url}
          alt="Attachment"
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
        />
      )}
    </div>,
    document.body
  );
}
