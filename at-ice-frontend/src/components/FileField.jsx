import { useRef } from "react";
import { previewLocalFile } from "../lib/preview";

// One file picker for every upload field: shows the chosen file's name and
// size (click it to preview the file) with Replace and ✕ Remove. Remove also resets the hidden <input> so the
// same file can be picked again. `onChange(file | null)`; `validate(file)`
// returns an error message to turn a file down (the input is reset then too).
export default function FileField({
  file, onChange, accept, label = "Choose a file", hint = "", maxBytes, validate,
  onError, disabled = false, id, className = "",
}) {
  const inputRef = useRef(null);

  const reset = () => { if (inputRef.current) inputRef.current.value = ""; };

  const pick = (e) => {
    const f = e.target.files?.[0] || null;
    reset();
    if (!f) return;
    const problem = (maxBytes && f.size > maxBytes ? `The file is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.` : "") || validate?.(f) || "";
    if (problem) {
      onError?.(problem);
      return;
    }
    onError?.("");
    onChange(f);
  };

  const remove = () => { reset(); onChange(null); onError?.(""); };
  const size = file ? (file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : "";

  return (
    <div className={className}>
      <input ref={inputRef} id={id} type="file" accept={accept} onChange={pick} disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" />
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-50/40">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true" className="text-cyan-600 flex-shrink-0">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 3v5h5" strokeLinejoin="round" />
          </svg>
          <button type="button" onClick={() => previewLocalFile(file)} title={`Preview ${file.name}`} className="flex-1 min-w-0 text-left cursor-pointer group">
            <span className="block text-[12px] font-medium text-slate-700 truncate group-hover:text-cyan-700 group-hover:underline">{file.name}</span>
            <span className="block text-[10px] text-slate-500">{size} · click to preview</span>
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="text-[11px] font-medium text-cyan-700 hover:underline cursor-pointer disabled:opacity-50">
            Replace
          </button>
          <button type="button" onClick={remove} disabled={disabled} aria-label={`Remove ${file.name}`} title="Remove" className="w-6 h-6 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50">
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-black/[0.12] text-left hover:border-cyan-500/60 cursor-pointer disabled:opacity-50"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true" className="text-slate-400 flex-shrink-0">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-medium text-slate-600">{label}</span>
            {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
          </span>
        </button>
      )}
    </div>
  );
}
