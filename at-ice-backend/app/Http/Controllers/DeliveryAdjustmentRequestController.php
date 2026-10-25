<?php

namespace App\Http\Controllers;

use App\Models\DeliveryAdjustmentRequest;
use App\Support\DeliveryAdjust;
use Illuminate\Http\Request;

// Admin > Deliveries: the stores' requests to change the sacks on one of their
// deliveries (App\Support\DeliveryAdjust). Admin applies or declines each one;
// nothing changes on a delivery until then (owner, 2026-10-22).
class DeliveryAdjustmentRequestController extends Controller
{
    // GET /api/delivery-adjustment-requests?status=pending (newest first)
    public function index(Request $request)
    {
        $status = $request->query('status', 'pending');
        $rows = DeliveryAdjustmentRequest::with([
            'customer:id,name,branch_code',
            'delivery:id,delivery_no,status,scheduled_date,ordered_at,driver_id',
            'delivery.driver:id,name',
            'reviewer:id,name',
        ])
            ->when($status !== 'all', fn ($q) => $q->where('status', in_array($status, DeliveryAdjustmentRequest::STATUSES, true) ? $status : 'pending'))
            ->latest()
            ->limit(200)
            ->get()
            ->map(fn ($r) => $r->setAttribute('delivery_open', in_array($r->delivery?->status, DeliveryAdjust::OPEN, true)));

        return response()->json($rows);
    }

    // POST /api/delivery-adjustment-requests/{id}/apply  { note? }
    public function apply(Request $request, $id)
    {
        $data = $request->validate(['note' => 'nullable|string|max:200']);
        $row = DeliveryAdjustmentRequest::with(['delivery', 'customer'])->findOrFail($id);

        return response()->json(DeliveryAdjust::applyRequest($row, isset($data['note']) ? trim($data['note']) : null));
    }

    // POST /api/delivery-adjustment-requests/{id}/decline  { note } (shown to the store)
    public function decline(Request $request, $id)
    {
        $data = $request->validate(['note' => 'required|string|min:3|max:200']);
        $row = DeliveryAdjustmentRequest::with(['delivery', 'customer'])->findOrFail($id);

        return response()->json(DeliveryAdjust::declineRequest($row, trim($data['note'])));
    }
}
