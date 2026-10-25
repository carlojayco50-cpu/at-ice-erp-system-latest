// Disciplinary memos: one set of labels and colors for HR > Memos and the
// employee's My Memos (keys match App\Models\EmployeeMemo on the backend).
// Colors follow the system's meanings: waiting amber, in progress deep cyan,
// done emerald, cancelled gray, urgent rose.

export const MEMO_STATUS = {
  draft: { label: "Draft (HR review)", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent, awaiting acknowledgment", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  acknowledged: { label: "Acknowledged", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  awaiting_physical: { label: "Sent to account, awaiting physical sign-off", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  archived: { label: "Physically signed and archived", cls: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const MEMO_LEVEL = {
  verbal_warning: { label: "Verbal Warning", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  first_written: { label: "First Written Warning", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  final_written: { label: "Final Written Warning", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  nte: { label: "Notice to Explain", cls: "bg-rose-100 text-rose-900 border-rose-300" },
};

export const MEMO_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx";

export const isUrgentMemo = (m) => m.status === "awaiting_physical";
