import { useRef, useState } from "react";

// A recessed drop zone for several files (memo evidence, a signed copy):
// drop files on it or click to pick them; the chosen files are listed with
// a Remove link. The parent keeps the File list.
//   <FileDropZone files={files} onChange={setFiles} accept=".pdf,.jpg" label="Drop files" hint="PDF or pictures, up to 10 MB" />
export default function FileDropZone({ files, onChange, accept, label = "Drop files here or click to choose", hint, max = 10, maxSizeMb = 10, disabled = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const add = (list) => {
    setError("");
    const allowed = accept ? accept.split(",").map((s) => s.trim().toLowerCase()) : null;
    const picked = [...list].filter((f) => {
      const ext = `.${f.name.split(".").pop().toLowerCase()}`;
      if (allowed && !allowed.includes(ext)) {
        setError(`${f.name} is not an allowed file type.`);
        return false;
      }
      if (f.size > maxSizeMb * 1024 * 1024) {
        setError(`${f.name} is larger than ${maxSizeMb} MB.`);
        return false;
      }
      return true;
    });
    const next = [...files, ...picked].slice(0, max);
    if (files.length + picked.length > max) setError(`Up to ${max} files.`);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-no-confirm
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
        title="Drop files here, or click to choose them"
        className={`file-drop w-full rounded-xl border-2 border-dashed px-4 py-5 text-center shadow-inner transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          over ? "border-cyan-500 bg-cyan-50/60" : "border-slate-300 bg-slate-50 hover:border-cyan-400"
        }`}
      >
        <div className="text-[13px] font-medium text-slate-700">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
      </button>
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-slate-700" title={f.name}>{f.name}</span>
              <span className="text-slate-400 whitespace-nowrap">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" data-no-confirm onClick={() => onChange(files.filter((_, j) => j !== i))} title="Remove this file" className="text-rose-600 hover:underline cursor-pointer">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
