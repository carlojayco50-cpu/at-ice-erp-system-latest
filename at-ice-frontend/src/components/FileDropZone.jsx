import { useEffect, useRef, useState } from "react";

// A recessed drop zone for several files (memo evidence, a signed copy):
// drop files on it or click to pick them; the chosen files are listed with
// a Remove link. The parent keeps the File list.
//   <FileDropZone files={files} onChange={setFiles} accept=".pdf,.jpg" label="Drop files" hint="PDF or pictures, up to 10 MB" />
// With uploadTo, every file uploads as soon as it is added and shows a progress bar.
//   <FileDropZone ... uploadTo="/api/memos/1/files" uploadField="file" onUploaded={(file, data) => ...} />
// progress (0-100) and uploadError come from the parent while it sends the form.
export default function FileDropZone({ files, onChange, accept, label = "Drop files here or click to choose", hint, max = 10, maxSizeMb = 10, disabled = false, uploadTo, uploadField = "file", uploadExtra, onUploaded, progress = null, uploadError = "" }) {
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
      {progress !== null && <UploadBar progress={progress} error={uploadError} />}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[12px]">
              {uploadTo ? (
                <FileUploadProgress file={f} url={uploadTo} field={uploadField} extra={uploadExtra} onUploaded={onUploaded} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={f.name}>{f.name}</span>
                  <span className="text-slate-400 whitespace-nowrap">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" data-no-confirm onClick={() => onChange(files.filter((_, j) => j !== i))} title="Remove this file" className="text-rose-600 hover:underline cursor-pointer">
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One file uploading: a percent bar, then a green check or a red error with Retry.
export function FileUploadProgress({ file, url, field = "file", extra, onUploaded, onRemove }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("uploading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const sending = useRef(false);
  const latest = useRef({});

  useEffect(() => {
    latest.current = { extra, onUploaded };
  });

  useEffect(() => {
    sending.current = true;

    const body = new FormData();
    Object.entries(latest.current.extra || {}).forEach(([k, v]) => body.append(k, v));
    body.append(field, file);

    const req = new XMLHttpRequest();
    req.open("POST", url);
    req.setRequestHeader("Accept", "application/json");
    req.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token") || ""}`);
    req.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    req.onload = () => {
      sending.current = false;
      let data = null;
      try { data = JSON.parse(req.responseText); } catch { /* not json */ }
      if (req.status >= 200 && req.status < 300) {
        setProgress(100);
        setStatus("done");
        latest.current.onUploaded?.(file, data);
      } else {
        const first = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
        setStatus("error");
        setMessage(first || data?.message || `Upload failed (${req.status}).`);
      }
    };
    req.onerror = () => {
      sending.current = false;
      setStatus("error");
      setMessage("Network error. Check the connection and try again.");
    };
    req.send(body);

    return () => {
      if (sending.current) req.abort();
    };
  }, [attempt, file, url, field]);

  const bar = status === "error" ? "bg-red-500" : status === "done" ? "bg-emerald-500" : "bg-cyan-500";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-slate-700" title={file.name}>{file.name}</span>
        <span className="text-slate-400 whitespace-nowrap">{Math.max(1, Math.round(file.size / 1024))} KB</span>
        {status === "done" && <span className="text-emerald-600 font-medium whitespace-nowrap">Uploaded</span>}
        {status === "error" && (
          <button type="button" data-no-confirm onClick={() => { setStatus("uploading"); setProgress(0); setMessage(""); setAttempt((n) => n + 1); }} className="text-cyan-600 hover:underline cursor-pointer">Retry</button>
        )}
        <button type="button" data-no-confirm onClick={onRemove} title="Remove this file" className="text-rose-600 hover:underline cursor-pointer">Remove</button>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className={`h-full rounded-full transition-[width] duration-200 ${bar}`} style={{ width: `${progress}%` }} />
      </div>
      <div className={`text-[11px] ${status === "error" ? "text-red-600" : "text-slate-500"}`}>
        {status === "uploading" && `Uploading… ${progress}%`}
        {status === "done" && "Upload complete"}
        {status === "error" && message}
      </div>
    </div>
  );
}

// Upload progress for a whole form submit: a percent bar, then done or the error.
export function UploadBar({ progress, error = "" }) {
  const state = error ? "error" : progress >= 100 ? "done" : "uploading";
  const bar = state === "error" ? "bg-red-500" : state === "done" ? "bg-emerald-500" : "bg-cyan-500";
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className={`h-full rounded-full transition-[width] duration-200 ${bar}`} style={{ width: `${error ? 100 : progress}%` }} />
      </div>
      <div className={`text-[11px] ${state === "error" ? "text-red-600" : "text-slate-500"}`}>
        {state === "uploading" && `Uploading… ${progress}%`}
        {state === "done" && "Upload complete"}
        {state === "error" && error}
      </div>
    </div>
  );
}
