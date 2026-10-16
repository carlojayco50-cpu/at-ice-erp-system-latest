import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import PhoneInput from "../../components/PhoneInput";
import { ANY_REGEX, ANY_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import AddressFields from "../../components/AddressFields";
import { ScopeStatusRow } from "../../components/NightMode";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const inputCls = "text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400";

const emptyForm = {
  name: "",
  contact_person: "",
  contact_number: "",
  email: "",
  address: "",
  barangay: "",
  barangay_code: "",
  city: "",
  province: "",
  region: "",
  notes: "",
};

export default function CheckerSupplierManagementPage() {
  const navigate = useNavigate();
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Kept as a draft while the form is open, so a refresh reopens it as it was.
  const formDraft = useDraft("checker:supplier", { showForm: false, editingId: null, form: emptyForm }, { when: (v) => v.showForm });
  const { showForm, editingId, form } = formDraft.values; // editingId null = creating new
  const { showForm: setShowForm, editingId: setEditingId, form: setForm } = formDraft.set;
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [notice, setNotice] = useState("");
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/suppliers", {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load suppliers.");
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load on open
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["suppliers"]);
  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers, live]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(s) {
    setEditingId(s.id);
    setError("");
    setForm({
      name: s.name || "",
      contact_person: s.contact_person || "",
      contact_number: localDigits(s.contact_number),
      email: s.email || "",
      address: s.address || "",
      barangay: s.barangay || "",
      barangay_code: s.barangay_code || "",
      city: s.city || "",
      province: s.province || "",
      region: s.region || "",
      notes: s.notes || "",
    });
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Enter the supplier name.");
    if (form.contact_number && !ANY_REGEX.test(form.contact_number)) return setError(ANY_MESSAGE);
    setSubmitting(true);
    try {
      const url = editingId ? `/api/suppliers/${editingId}` : "/api/suppliers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          contact_number: toStoredPhone(form.contact_number) || null,
          email: form.email.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface Laravel validation messages (e.g. "The supplier code field is required.")
        const firstError =
          data.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(firstError || data.message || "Could not save this supplier.");
      }
      setNotice(editingId ? `${form.name.trim()} updated.` : `${form.name.trim()} added as ${data.supplier_code || "a new supplier"}.`);
      toast.success(editingId ? `${form.name.trim()} was updated.` : `${form.name.trim()} was added.`);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchSuppliers();
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Could not remove this supplier.");
      }
      setNotice("Supplier removed.");
      toast.success("Supplier was removed.");
      fetchSuppliers();
    } catch (e) {
      setError(e.message || "Request failed. Try again.");
    } finally {
      setDeletingId(null);
      setConfirmRemoveId(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-black/[0.09]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/checker/dashboard")}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeftIcon />
          </button>
          <span className="brand-logo w-11 h-11 flex-shrink-0 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"><img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-1" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-800 leading-tight">
              Supplier Management
            </div>
            <div className="text-[12px] text-slate-400 leading-tight">
              {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} of supplies and materials
            </div>
          </div>
        </div>
        <ScopeStatusRow className="px-4 pb-3" />
        <TimeInNotice timedIn={timedIn} className="mx-4 mb-3" />

        {!showForm && (
          <div className="px-4 pb-3 flex">
            <button
              onClick={startCreate}
              className="flex items-center gap-1 text-[12px] font-semibold bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-3 py-1.5 transition-colors"
            >
              <PlusIcon /> Add Supplier
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="px-4 pb-4 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3">
            <div className="text-[13px] font-semibold text-slate-800">
              {editingId ? "Edit Supplier" : "Add Supplier"}
              {!editingId && <span className="ml-2 text-[11px] font-normal text-slate-400">Code is assigned automatically</span>}
            </div>
            <DraftHint draft={formDraft} />
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Supplier name"
              required
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
            />
            <input
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              placeholder="Contact person"
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
            />
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0">
                <PhoneInput
                  value={form.contact_number}
                  onChange={(v) => setForm({ ...form, contact_number: v })}
                  placeholder="Contact no."
                  className={inputCls}
                  invalid={!!form.contact_number && !ANY_REGEX.test(form.contact_number)}
                />
              </div>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
                placeholder="Email"
                className="flex-1 min-w-0 text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
              />
            </div>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="House no., street, subdivision"
              aria-label="Street address"
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <AddressFields
                value={form}
                onChange={handleAddress}
                details={false}
                inputClassName="w-full min-w-0 text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400 disabled:opacity-60"
              />
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (optional)"
              rows={2}
              className="text-[13px] border border-black/[0.09] rounded-lg px-3 py-2 outline-none focus:border-cyan-400 resize-none"
            />
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || timedIn === false}
                className="flex-1 text-[13px] font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving…" : editingId ? "Save changes" : "Add supplier"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setError("");
                }}
                className="text-[13px] font-medium border border-black/[0.09] text-slate-500 hover:text-slate-800 rounded-lg px-4 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="w-full px-4 py-4 flex flex-col gap-2.5 max-w-2xl mx-auto">
        {!showForm && error && (
          <div className="text-[13px] text-red-500 text-center py-2">{error}</div>
        )}
        {notice && (
          <div className="px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-[12px] text-green-700 text-center">
            {notice}
          </div>
        )}
        {loading && <SkeletonList />}
        {!loading && suppliers.length === 0 && (
          <EmptyState icon="store">No suppliers added yet. Use Add Supplier to create one.</EmptyState>
        )}

        {!loading &&
          suppliers.map((s) => (
            <div key={s.id} className="rounded-xl border border-black/[0.09] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-slate-800 truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{s.supplier_code}</div>
                  {s.contact_person && (
                    <div className="text-[12px] text-slate-400 mt-1">{s.contact_person}</div>
                  )}
                  <div className="text-[12px] text-slate-500 mt-1 flex flex-wrap gap-x-3">
                    {s.contact_number && <span>{s.contact_number}</span>}
                    {s.email && <span>{s.email}</span>}
                  </div>
                  {(s.address || s.barangay || s.city || s.province) && (
                    <div className="text-[12px] text-slate-400 mt-1">
                      {[s.address, s.barangay && `Brgy. ${s.barangay}`, s.city, s.province].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {s.notes && <div className="text-[12px] text-slate-400 mt-1 italic">{s.notes}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {confirmRemoveId === s.id ? (
                    <>
                      <span className="text-[12px] text-slate-500">Remove?</span>
                      <button
                        onClick={() => remove(s.id)}
                        disabled={deletingId === s.id || timedIn === false}
                        className="text-[12px] font-semibold text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deletingId === s.id ? "Removing…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="text-[12px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(s)}
                        className="text-[12px] font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(s.id)}
                        className="text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}