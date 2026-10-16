import { useEffect, useState, useCallback } from "react";
import RoleShell from "../../components/RoleShell";
import { LoadingButton, BottomSheet, ActionBar, ErrorBanner, SuccessBanner, EmptyCard, CardSkeleton, Icon } from "../../components/MobileUi";
import { CARD, FIELD, TEXTAREA, LABEL } from "../../lib/mobileUi";
import PhoneInput from "../../components/PhoneInput";
import { ANY_REGEX, ANY_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import { useLiveTick } from "../../lib/live";
import AddressFields from "../../components/AddressFields";
import { useTimedIn } from "../../lib/timeIn";
import TimeInNotice from "../../components/TimeInNotice";

const emptyForm = {
  name: "", contact_person: "", contact_number: "", email: "", address: "",
  barangay: "", barangay_code: "", city: "", province: "", region: "", notes: "",
};

// Checker > Suppliers: suppliers of supplies and materials (code assigned
// automatically). Add and edit in a bottom sheet; removing asks first.
export default function CheckerSupplierManagementPage() {
  const timedIn = useTimedIn();
  const token = localStorage.getItem("token");
  const [suppliers, setSuppliers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");

  const formDraft = useDraft("checker:supplier", { showForm: false, editingId: null, form: emptyForm }, { when: (v) => v.showForm });
  const { showForm, editingId, form } = formDraft.values; // editingId null = new
  const { showForm: setShowForm, editingId: setEditingId, form: setForm } = formDraft.set;
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/suppliers", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load suppliers.");
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : data.data || []);
      setStatus("ready");
    } catch (e) {
      setLoadError(e.message || "Request failed. Try again.");
      setStatus("error");
    }
  }, [token]);
  const live = useLiveTick(["suppliers"]);
  useEffect(() => { load(); }, [load, live]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  }
  function startEdit(s) {
    setEditingId(s.id);
    setFormError("");
    setForm({
      name: s.name || "", contact_person: s.contact_person || "", contact_number: localDigits(s.contact_number), email: s.email || "",
      address: s.address || "", barangay: s.barangay || "", barangay_code: s.barangay_code || "", city: s.city || "",
      province: s.province || "", region: s.region || "", notes: s.notes || "",
    });
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (!form.name.trim()) return setFormError("Enter the supplier name.");
    if (form.contact_number && !ANY_REGEX.test(form.contact_number)) return setFormError(ANY_MESSAGE);
    setSubmitting(true);
    try {
      const res = await fetch(editingId ? `/api/suppliers/${editingId}` : "/api/suppliers", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, name: form.name.trim(), contact_number: toStoredPhone(form.contact_number) || null, email: form.email.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors ? Object.values(data.errors)[0]?.[0] : null) || data.message || "Could not save this supplier.");
      setNotice(editingId ? `${form.name.trim()} updated.` : `${form.name.trim()} added as ${data.supplier_code || "a new supplier"}.`);
      toast.success(editingId ? `${form.name.trim()} was updated.` : `${form.name.trim()} was added.`);
      formDraft.clear();
      load();
    } catch (e) {
      setFormError(e.message || "Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (removing || !removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/suppliers/${removeTarget.id}`, { method: "DELETE", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Could not remove this supplier.");
      }
      setSuppliers((list) => list.filter((s) => s.id !== removeTarget.id));
      toast.success("Supplier was removed.");
      setRemoveTarget(null);
      load();
    } catch (e) {
      toast.error(e.message || "Request failed. Try again.");
    } finally {
      setRemoving(false);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = q ? suppliers.filter((s) => `${s.name} ${s.supplier_code} ${s.contact_person || ""} ${s.city || ""}`.toLowerCase().includes(q)) : suppliers;

  return (
    <RoleShell
      role="checker"
      title="Suppliers"
      actionBar={<ActionBar><LoadingButton onClick={startCreate} disabled={timedIn === false}><Icon name="plus" /> Add supplier</LoadingButton></ActionBar>}
    >
      <TimeInNotice timedIn={timedIn} />
      <SuccessBanner>{notice}</SuccessBanner>

      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier, code or city" aria-label="Search suppliers" className={`${FIELD} pl-10`} />
      </div>

      {status === "loading" && <CardSkeleton rows={3} />}
      {status === "error" && <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>}
      {status === "ready" && visible.length === 0 && (
        <EmptyCard icon="users" title={q ? "No match" : "No suppliers yet"}>{q ? "No supplier matches your search." : "Tap Add supplier to create one."}</EmptyCard>
      )}

      {status === "ready" && (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((s) => (
            <article key={s.id} className={CARD}>
              <h2 className="text-[15px] font-semibold text-slate-900">{s.name}</h2>
              <div className="text-[13px] text-slate-400 font-mono">{s.supplier_code}</div>
              {s.contact_person && <div className="text-[14px] text-slate-600 mt-1">{s.contact_person}</div>}
              <div className="text-[14px] text-slate-600 flex flex-wrap gap-x-3">
                {s.contact_number && <a href={`tel:${s.contact_number}`} className="min-h-[44px] inline-flex items-center text-cyan-700 font-semibold">{s.contact_number}</a>}
                {s.email && <span className="inline-flex items-center min-h-[44px] break-all">{s.email}</span>}
              </div>
              {(s.address || s.barangay || s.city || s.province) && (
                <div className="text-[13px] text-slate-500">{[s.address, s.barangay && `Brgy. ${s.barangay}`, s.city, s.province].filter(Boolean).join(", ")}</div>
              )}
              {s.notes && <div className="text-[13px] text-slate-500 mt-1 italic">{s.notes}</div>}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <LoadingButton variant="secondary" onClick={() => startEdit(s)} disabled={timedIn === false}><Icon name="edit" size={16} /> Edit</LoadingButton>
                <LoadingButton variant="secondary" className="!text-rose-700" onClick={() => setRemoveTarget(s)} disabled={timedIn === false}>Remove</LoadingButton>
              </div>
            </article>
          ))}
        </div>
      )}

      <BottomSheet
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        title={editingId ? "Edit supplier" : "Add supplier"}
        footer={<LoadingButton type="submit" form="supplier-form" loading={submitting} disabled={timedIn === false}>{submitting ? "Saving…" : editingId ? "Save changes" : "Add supplier"}</LoadingButton>}
      >
        <form id="supplier-form" onSubmit={submit} className="space-y-4" noValidate>
          <DraftHint draft={formDraft} />
          <ErrorBanner>{formError}</ErrorBanner>
          {!editingId && <p className="text-[13px] text-slate-500">The supplier code is assigned automatically.</p>}
          <div>
            <label htmlFor="sup-name" className={LABEL}>Supplier name *</label>
            <input id="sup-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="sup-person" className={LABEL}>Contact person</label>
            <input id="sup-person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Contact number</label>
            <PhoneInput value={form.contact_number} onChange={(v) => setForm({ ...form, contact_number: v })} placeholder="917 123 4567" className={FIELD}
              invalid={!!form.contact_number && !ANY_REGEX.test(form.contact_number)} />
          </div>
          <div>
            <label htmlFor="sup-email" className={LABEL}>Email</label>
            <input id="sup-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="sup-address" className={LABEL}>House no., street, subdivision</label>
            <input id="sup-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={FIELD} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <AddressFields value={form} onChange={handleAddress} details={false} inputClassName={`${FIELD} disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="sup-notes" className={LABEL}>Notes</label>
            <textarea id="sup-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={TEXTAREA} />
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={!!removeTarget}
        onClose={() => !removing && setRemoveTarget(null)}
        title="Remove this supplier?"
        footer={<>
          <LoadingButton variant="danger" loading={removing} onClick={remove}>Remove supplier</LoadingButton>
          <LoadingButton variant="secondary" disabled={removing} onClick={() => setRemoveTarget(null)}>Keep it</LoadingButton>
        </>}
      >
        {removeTarget && <p className="text-[15px] text-slate-600"><b>{removeTarget.name}</b> ({removeTarget.supplier_code}) will be removed from the supplier list.</p>}
      </BottomSheet>
    </RoleShell>
  );
}
