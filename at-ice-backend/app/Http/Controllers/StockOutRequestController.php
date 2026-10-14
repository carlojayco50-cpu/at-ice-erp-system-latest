<?php

namespace App\Http\Controllers;

use App\Models\InventoryAlert;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\StockOutRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StockOutRequestController extends Controller
{
    private const RELATIONS = [
        'requestedBy:id,name',
        'approvedBy:id,name',
        'releasedBy:id,name',
        'product:id,name,unit,current_stock',
        'project:id,name,status',
    ];

    /**
     * GET /api/stock-out-items
     * The inventory items Maintenance can request, with the stock on hand.
     */
    public function items()
    {
        return response()->json(
            Product::where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'unit', 'category', 'current_stock'])
        );
    }

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
     * Maintenance submits a request for an inventory item.
     * The stock is deducted only when the Admin releases it.
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
            'product_id' => ['required', Rule::exists('products', 'id')->where('is_active', true)->whereNull('deleted_at')],
            'quantity' => 'required|integer|min:1',
            'purpose' => 'required|string|max:1000',
            // The project on Admin's board it is for (optional; only open projects).
            'project_id' => ['nullable', Rule::exists('projects', 'id')->whereIn('status', ['planned', 'working', 'stuck'])],
        ], [
            'project_id.exists' => 'That project is closed or no longer exists. Choose another one.',
            'product_id.required' => 'Choose the item you need.',
            'product_id.exists' => 'That item is no longer in the inventory.',
        ]);

        $product = Product::findOrFail($validated['product_id']);
        if ($validated['quantity'] > $product->current_stock) {
            $text = "Not enough stock. Available: {$product->current_stock} {$product->unit}.";

            return response()->json(['message' => $text, 'errors' => ['quantity' => [$text]]], 422);
        }

        $stockOutRequest = StockOutRequest::create([
            'requested_by' => $user->id,
            'product_id' => $product->id,
            'project_id' => $validated['project_id'] ?? null,
            'item_name' => $product->name,
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
     * Release an approved request: the item's stock is deducted and a
     * confirmed Stock Out is recorded in the movement history.
     * An older free-text request (no item linked) is released without a
     * stock change, since there is no item to deduct from.
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

        try {
            DB::transaction(function () use ($stockOutRequest, $user) {
                // Locked and read again, so a double click releases (and deducts) once.
                $locked = StockOutRequest::lockForUpdate()->findOrFail($stockOutRequest->id);
                if ($locked->status !== 'approved') {
                    throw new \RuntimeException('Only approved requests can be released.');
                }

                $movementId = null;
                if ($locked->product_id) {
                    $product = Product::lockForUpdate()->find($locked->product_id);
                    if (! $product) {
                        throw new \RuntimeException('This item is no longer in the inventory, so it cannot be released.');
                    }
                    if ($locked->quantity > $product->current_stock) {
                        throw new \RuntimeException("Not enough stock to release. Available: {$product->current_stock} {$product->unit}.");
                    }

                    $newStock = $product->current_stock - $locked->quantity;
                    $movement = StockMovement::create([
                        'product_id' => $product->id,
                        'type' => 'stock_out',
                        'quantity' => $locked->quantity,
                        'stock_before' => $product->current_stock,
                        'stock_after' => $newStock,
                        'reference_no' => 'SOR-'.str_pad($locked->id, 4, '0', STR_PAD_LEFT),
                        'source' => 'maintenance',
                        'reason' => $locked->purpose,
                        'status' => 'confirmed',
                        'entered_by' => $locked->requested_by,
                        'confirmed_by' => $user->id,
                        'confirmed_at' => now(),
                    ]);
                    $product->update(['current_stock' => $newStock]);
                    $movementId = $movement->id;

                    if ($product->isLowStock()) {
                        InventoryAlert::firstOrCreate(
                            ['product_id' => $product->id, 'alert_type' => 'low_stock', 'is_resolved' => false],
                            ['message' => "{$product->name} is low on stock. Current: {$newStock} {$product->unit}(s)."]
                        );
                    }
                }

                $locked->update([
                    'status' => 'released',
                    'released_by' => $user->id,
                    'released_at' => now(),
                    'stock_movement_id' => $movementId,
                ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => $stockOutRequest->product_id
                ? 'Item released and stock updated.'
                : 'Request released. No inventory item is linked, so the stock was not changed.',
            'request' => $stockOutRequest
                ->fresh()
                ->load(self::RELATIONS),
        ]);
    }
}
