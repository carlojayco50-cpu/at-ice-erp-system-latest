// Small "Draft restored · Discard" line shown at the top of a form whose
// unsaved inputs came back after a refresh (lib/useDraft.js). Discard empties
// the form and forgets the draft; onDiscard runs after that (e.g. close a modal).
export default function DraftHint({ draft, onDiscard, className = "" }) {
  if (!draft?.restored) return null;
  return (
    <div role="status" className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 ${className}`}>
      <span className="flex-1">Draft restored. Your unsaved inputs came back after the page reloaded.</span>
      <button type="button" onClick={draft.dismiss} className="font-medium text-amber-700 hover:underline cursor-pointer">OK</button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => { draft.clear(); onDiscard?.(); }}
        className="font-semibold text-red-600 hover:underline cursor-pointer"
      >
        Discard
      </button>
    </div>
  );
}
