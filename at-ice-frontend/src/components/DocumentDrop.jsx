import { useRef, useState } from "react";
import { openProtectedFile } from "../lib/openFile";
import { DOCUMENT_TYPES } from "../lib/biodata";

// Section 6 of the biodata (owner, 2026-10-20): one dashed drop zone per kind
// of document (resume, 2x2 photo, NBI clearance, government IDs, diploma,
// others). A file is dropped or picked (on a phone the picker offers the
// camera); each one shows its upload progress.
//   items: [{ key, type, name, size, progress (0-100), status: queued|uploading|done|error, error, doc }]
//   onAdd(type, File[])         a file was chosen
//   onRemove(item)              remove a queued file or an attached document
//   viewUrl(doc)                where an attached document is opened (private)
export default function DocumentDrop({ items, onAdd, onRemove, viewUrl, disabled = false, types = DOCUMENT_TYPES }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {types.map((t) => (
        <Zone key={t.type} kind={t} items={items.filter((i) => i.type === t.type)} onAdd={onAdd} onRemove={onRemove} viewUrl={viewUrl} disabled={disabled} />
      ))}
    </div>
  );
}

function Zone({ kind, items, onAdd, onRemove, viewUrl, disabled }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (files) => { if (files?.length && !disabled) onAdd(kind.type, [...files]); };

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {/* a div, not a <button>: the theme raises every button, and a drop
          zone stays a flat dashed area */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        data-no-confirm
        data-tip={`Drop or choose a file: ${kind.hint}`}
        className={`w-full rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors outline-none focus-visible:border-cyan-500 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${over ? "border-cyan-500 bg-cyan-50" : "border-slate-300 hover:border-cyan-400"}`}
      >
        <div className="text-[12.5px] font-semibold text-slate-700">{kind.label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">Drop here or tap to choose · {kind.hint}</div>
      </div>
      <input ref={input} type="file" accept={kind.accept} capture={kind.capture} multiple={kind.type !== "photo"} hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {items.map((it) => (
        <div key={it.key} className="rounded-lg border border-black/[0.09] px-3 py-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[12px] text-slate-700 truncate" title={it.name}>{it.name}</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {it.status === "done" && it.doc && viewUrl && (
                <button type="button" data-no-confirm onClick={() => openProtectedFile(viewUrl(it.doc), it.name)} className="text-[11px] font-medium text-cyan-700 hover:underline">View</button>
              )}
              {it.status !== "uploading" && (
                <button type="button" onClick={() => onRemove(it)} aria-label={`Remove ${it.name}`}
                  data-confirm={it.status === "done" ? `${it.name} is deleted from the documents.` : undefined}
                  data-confirm-title={it.status === "done" ? `Remove ${it.name}?` : undefined}
                  className="text-[11px] font-medium text-rose-700 hover:underline">
                  Remove
                </button>
              )}
            </span>
          </div>
          {(it.status === "uploading" || it.status === "queued") && (
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={it.progress || 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-cyan-600 transition-[width] duration-200" style={{ width: `${it.progress || 0}%` }} />
            </div>
          )}
          <div className="text-[10.5px] mt-1 text-slate-500">
            {it.status === "queued" && "Uploads when the employee is saved"}
            {it.status === "uploading" && `Uploading… ${it.progress || 0}%`}
            {it.status === "done" && `Attached${it.size ? ` · ${Math.max(1, Math.round(it.size / 1024))} KB` : ""}`}
            {it.status === "error" && <span className="text-rose-700">{it.error}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
