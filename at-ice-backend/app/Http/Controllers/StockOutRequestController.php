<?php

namespace App\Http\Controllers;

use App\Models\StockOutRequest;
use Illuminate\Http\Request;

class StockOutRequestController extends Controller
{
    private const RELATIONS = [
        'requestedBy:id,name',
        'approvedBy:id,name',
        'releasedBy:id,name',
    ];

    /**
     * Maintenance sees only their own requests.
     * Admin sees all requests.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = StockOutRequest::with(self::RELATIONS)
            ->orderBy('created_at', 'desc');

        // Maintenance can only see their own requests.
        if (
            $user->role === 'employee' &&
            $user->sub_role === 'maintenance'
        ) {
            $query->where('requested_by', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(
            $query->paginate(50)
        );
    }

    /**
     * Maintenance submits a request.
     *
     * The requested part can be ANY text.
     * It does NOT need to exist in the products table.
     */
    public function store(Request $request)
    {
        $user = $request->user();

        // Only Maintenance can submit requests.
        if (
            $user->role !== 'employee' ||
            $user->sub_role !== 'maintenance'
        ) {
            return response()->json([
                'message' => 'Only Maintenance can submit stock-out requests.',
            ], 403);
        }

        $validated = $request->validate([
            'item_name' => 'required|string|max:255',
            'quantity' => 'required|integer|min:1',
            'purpose' => 'required|string|max:1000',
        ]);

        $stockOutRequest = StockOutRequest::create([
            'requested_by' => $user->id,
            'item_name' => $validated['item_name'],
            'quantity' => $validated['quantity'],
            'purpose' => $validated['purpose'],
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Request submitted successfully. Waiting for Admin approval.',
            'request' => $stockOutRequest->load(self::RELATIONS),
        ], 201);
    }

    /**
     * Show one request.
     */
    public function show(StockOutRequest $stockOutRequest)
    {
        return response()->json(
            $stockOutRequest->load(self::RELATIONS)
        );
    }

    /**
     * ADMIN ONLY:
     * Approve a pending request.
     */
    public function approve(Request $request, StockOutRequest $stockOutRequest)
    {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'message' => 'Only Admin can approve stock-out requests.',
            ], 403);
        }

        if ($stockOutRequest->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending requests can be approved.',
            ], 422);
        }

        $stockOutRequest->update([
            'status' => 'approved',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'rejection_reason' => null,
        ]);

        return response()->json([
            'message' => 'Request approved successfully.',
            'request' => $stockOutRequest
                ->fresh()
                ->load(self::RELATIONS),
        ]);
    }

    /**
     * ADMIN ONLY:
     * Reject a pending request.
     */
    public function reject(
        Request $request,
        StockOutRequest $stockOutRequest
    ) {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'message' => 'Only Admin can reject stock-out requests.',
            ], 403);
        }

        if ($stockOutRequest->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending requests can be rejected.',
            ], 422);
        }

        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:1000',
        ]);

        $stockOutRequest->update([
            'status' => 'rejected',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'rejection_reason' => $validated['rejection_reason'],
        ]);

        return response()->json([
            'message' => 'Request rejected successfully.',
            'request' => $stockOutRequest
                ->fresh()
                ->load(self::RELATIONS),
        ]);
    }

    /**
     * ADMIN ONLY:
     * Mark an approved request as released/completed.
     *
     * IMPORTANT:
     * Since Maintenance can request ANY part, this request does not
     * automatically deduct inventory from the products table.
     */
    public function release(
        Request $request,
        StockOutRequest $stockOutRequest
    ) {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'message' => 'Only Admin can release stock-out requests.',
            ], 403);
        }

        if ($stockOutRequest->status !== 'approved') {
            return response()->json([
                'message' => 'Only approved requests can be released.',
            ], 422);
        }

        $stockOutRequest->update([
            'status' => 'released',
            'released_by' => $user->id,
            'released_at' => now(),
        ]);

        return response()->json([
            'message' => 'Request released successfully.',
            'request' => $stockOutRequest
                ->fresh()
                ->load(self::RELATIONS),
        ]);
    }
}
