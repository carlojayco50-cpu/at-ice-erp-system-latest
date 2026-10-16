import { useRef, useState } from "react";
import { SCAN_ACCEPT, scanDocument } from "@/lib/scanDocument";
import { toast } from "@/lib/toast";

// Drop zone on Add Employee and Add Applicant (HR). kind "resume" takes a PDF
// or Word resume/CV; kind "license" (shown for Drivers only) takes a photo or
// PDF of the LTO driver's license and turns down anything else. onScan gets
// what was read, { person: { first_name, middle_initial, last_name, suffix,
// phone, email, license_number, license_expiry } | null, address: {...} | null }
// (lib/scanDocument.js), and the file itself. The page fills its form; use filledFrom() so a value
// the document does not show is left alone. After a scan the file name shows
// with ✕ Remove, which forgets the file (onRemove, e.g. drop an attached
// resume) and resets the input so the same file can be chosen again; the
// fields already filled in stay.
const TEXT = {
  resume: { title: "Drop the resume or CV here", types: "PDF or Word .docx", label: "Scan a resume or CV" },
  license: { title: "Drop the driver's license here", types: "photo or PDF of the LTO license", label: "Scan a driver's license" },
};

export default function ScanDropZone({ onScan, onRemove, kind = "resume", fills = "name, mobile number and address" }) {
  const text = TEXT[kind];
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const remove = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = "";
    setDone("");
    onRemove?.();
  };

  const read = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    setDone("");
    try {
      const result = await scanDocument(file, kind);
      onScan(result, file);
      setDone(file.name);
      toast.success("The form was filled in from the document. Check it before saving.");
    } catch (err) {
      toast.error(err.message || "The document could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    read(e.dataTransfer.files?.[0]);
  };

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      aria-busy={busy}
      className={`relative flex flex-col items-center justify-center gap-1 px-4 py-4 rounded-lg border-2 border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-cyan-500/40 ${
        busy ? "border-cyan-400 bg-cyan-50/60 cursor-wait"
          : over ? "border-cyan-500 bg-cyan-50 cursor-copy"
          : "border-cyan-500/40 bg-cyan-50/30 hover:bg-cyan-50/70 cursor-pointer"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={SCAN_ACCEPT[kind]}
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; read(f); }}
        className="sr-only"
        aria-label={text.label}
      />
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true" className={`text-cyan-600 ${busy ? "animate-pulse" : ""}`}>
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" strokeLinecap="round" />
      </svg>
      <span className="text-[12px] font-semibold text-cyan-700">
        {busy ? "Reading the document…" : over ? "Drop to scan" : text.title}
      </span>
      <span className="text-[11px] text-slate-500" aria-live="polite">
        {busy
          ? "This takes a few seconds."
          : done
            ? `Filled in from ${done}. Check every field before saving. Drop another file to scan again.`
            : `or click to choose (${text.types}). Fills in the ${fills}.`}
      </span>
      {done && !busy && (
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${done}`}
          className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-red-600 bg-white/80 hover:bg-red-50 cursor-pointer"
        >
          ✕ Remove
        </button>
      )}
    </label>
  );
}
