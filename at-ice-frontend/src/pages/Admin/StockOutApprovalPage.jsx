import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  released: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const TABS = ['all', 'pending', 'approved', 'rejected', 'released'];

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {String(status || "pending").charAt(0).toUpperCase() + String(status || "pending").slice(1)}
    </span>
  );
}

export default function StockOutApprovalPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [releasingId, setReleasingId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token = localStorage.getItem('token');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock-out-requests', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setRequests(data.data || []);
    } catch {
      setError('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load on open
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["stock-out"]);
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, live]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/stock-out-requests/${id}/approve`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Approve failed.');
      }
      await fetchRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async (id) => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setActionLoading(id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/stock-out-requests/${id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Reject failed.');
      }
      setRejectingId(null);
      setRejectionReason('');
      await fetchRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Admin releases an approved request: deducts the stock and records a
  // confirmed Stock Out in the movement history.
  const handleRelease = async (id) => {
    setActionLoading(id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/stock-out-requests/${id}/release`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Release failed.');
      }
      setReleasingId(null);
      setSuccess(data.message || 'Item released and stock updated.');
      await fetchRequests();
    } catch (err) {
      setError(err.message);
      setReleasingId(null);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = activeTab === 'all'
    ? requests
    : requests.filter((r) => r.status === activeTab);

  return (
    <AdminLayout pageTitle="Maintenance Stock-Out Approvals" breadcrumb="Admin / Stock-Out Approvals">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex flex-wrap justify-center gap-2 mb-5 border-b border-black/[0.09] pb-3">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-cyan-500 text-white'
                  : 'text-slate-500 hover:bg-black/[0.04]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
            {success}
          </div>
        )}

        {loading ? (
          <SkeletonList card />
        ) : filtered.length === 0 ? (
          <EmptyState icon="box">No requests in this category.</EmptyState>
        ) : (
          <div className="space-y-3">
            {filtered.map((req) => {
              const notEnough = req.product && req.product.current_stock < req.quantity;
              return (
                <div
                  key={req.id}
                  className="bg-white border border-black/[0.09] rounded-2xl shadow-sm px-5 py-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{req.product?.name || req.item_name}</h3>
                      <p className="text-sm text-slate-500">
                        Quantity: {req.quantity} {req.product?.unit || ''}
                        {req.product && (req.status === 'pending' || req.status === 'approved') && (
                          <span className={notEnough ? 'text-red-600' : 'text-slate-400'}>
                            {' '}· On hand: {req.product.current_stock}
                            {notEnough ? ' (not enough)' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>

                  <p className="text-sm text-slate-600 mt-2">{req.purpose}</p>
                  {req.project?.name && <p className="mt-1 inline-block px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-[11px] font-medium text-violet-700">Project: {req.project.name}</p>}

                  <p className="text-xs text-slate-400 mt-2">
                    Requested by {req.requested_by?.name || 'Unknown'} ·{' '}
                    {new Date(req.created_at).toLocaleString()}
                  </p>

                  {req.status === 'approved' && req.approved_by && (
                    <p className="text-xs text-slate-400 mt-1">
                      Approved by {req.approved_by.name}
                      {req.approved_at ? ` · ${new Date(req.approved_at).toLocaleString()}` : ''}
                    </p>
                  )}

                  {req.status === 'released' && (
                    <p className="text-xs text-slate-400 mt-1">
                      Approved by {req.approved_by?.name || 'Unknown'}
                      {req.approved_at ? ` · ${new Date(req.approved_at).toLocaleString()}` : ''}
                      {' | '}
                      Released by {req.released_by?.name || 'Unknown'}
                      {req.released_at ? ` · ${new Date(req.released_at).toLocaleString()}` : ''}
                    </p>
                  )}

                  {req.status === 'rejected' && req.rejection_reason && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">
                      Reason: {req.rejection_reason}
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="mt-3">
                      {rejectingId === req.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            className="w-full text-sm border border-black/[0.09] rounded-lg px-3 py-2 resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRejectSubmit(req.id)}
                              disabled={actionLoading === req.id}
                              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                            >
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(null);
                                setRejectionReason('');
                                setError('');
                              }}
                              className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-sm font-medium text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={actionLoading === req.id}
                            className="px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(req.id)}
                            className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-sm font-medium text-slate-600"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Release: Admin hands over the item, which deducts the stock */}
                  {req.status === 'approved' && (
                    <div className="mt-3">
                      {releasingId === req.id ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm text-slate-600">
                            Release {req.quantity} {req.product?.unit || ''} of {req.product?.name || req.item_name}? The stock will be deducted.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRelease(req.id)}
                              disabled={actionLoading === req.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                            >
                              {actionLoading === req.id ? 'Releasing...' : 'Confirm Release'}
                            </button>
                            <button
                              onClick={() => setReleasingId(null)}
                              disabled={actionLoading === req.id}
                              className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-sm font-medium text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setError('');
                            setSuccess('');
                            setReleasingId(req.id);
                          }}
                          disabled={notEnough || actionLoading === req.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                        >
                          Release
                        </button>
                      )}
                      {notEnough && (
                        <p className="text-xs text-red-600 mt-1">
                          Not enough stock on hand to release this request.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}