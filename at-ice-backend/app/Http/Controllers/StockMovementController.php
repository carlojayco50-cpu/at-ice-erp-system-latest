<?php

namespace App\Http\Controllers;

use App\Models\InventoryAlert;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockMovementController extends Controller
{
    public function index()
    {
        $movements = StockMovement::with(['product', 'enteredBy', 'confirmedBy'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($movements);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'type' => 'required|in:stock_in,stock_out,adjustment',
            'quantity' => 'required|integer|min:1',
            'reference_no' => 'nullable|string',
            'source' => 'nullable|string',
            'reason' => 'nullable|string',
        ]);

        $product = Product::findOrFail($validated['product_id']);

        // A Stock Out cannot take more than what is on hand.
        if ($validated['type'] === 'stock_out' && $validated['quantity'] > $product->current_stock) {
            return response()->json([
                'message' => "Not enough stock. Available: {$product->current_stock} {$product->unit}.",
                'errors' => ['quantity' => ["Not enough stock. Available: {$product->current_stock} {$product->unit}."]],
            ], 422);
        }

        $movement = StockMovement::create([
            ...$validated,
            'stock_before' => $product->current_stock,
            'stock_after' => $product->current_stock,
            'status' => 'pending',
            'entered_by' => $request->user()->id,
        ]);

        return response()->json($movement->load(['product', 'enteredBy']), 201);
    }

    public function confirm(Request $request, $id)
    {
        $movement = StockMovement::findOrFail($id);

        if ($movement->status !== 'pending') {
            return response()->json(['message' => 'Movement already processed.'], 422);
        }

        if ($movement->entered_by === $request->user()->id) {
            return response()->json(['message' => 'Cannot confirm your own entry. Double-entry requires a different user.'], 403);
        }

        try {
            DB::transaction(function () use ($movement, $request) {
                $product = Product::lockForUpdate()->findOrFail($movement->product_id);

                // Stock may have changed since this movement was logged.
                if ($movement->type === 'stock_out' && $movement->quantity > $product->current_stock) {
                    throw new \RuntimeException(
                        "Not enough stock to confirm this Stock Out. Available: {$product->current_stock} {$product->unit}."
                    );
                }

                $newStock = match ($movement->type) {
                    'stock_in' => $product->current_stock + $movement->quantity,
                    'stock_out' => $product->current_stock - $movement->quantity,
                    'adjustment' => $movement->quantity,
                };

                $movement->update([
                    'stock_before' => $product->current_stock,
                    'stock_after' => $newStock,
                    'status' => 'confirmed',
                    'confirmed_by' => $request->user()->id,
                    'confirmed_at' => now(),
                ]);

                $product->update(['current_stock' => $newStock]);

                if ($product->isLowStock()) {
                    InventoryAlert::firstOrCreate(
                        ['product_id' => $product->id, 'alert_type' => 'low_stock', 'is_resolved' => false],
                        ['message' => "{$product->name} is low on stock. Current: {$newStock} {$product->unit}(s)."]
                    );
                }
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Stock movement confirmed.',
            'movement' => $movement->fresh()->load(['product', 'enteredBy', 'confirmedBy']),
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $movement = StockMovement::findOrFail($id);

        if ($movement->status !== 'pending') {
            return response()->json(['message' => 'Only pending movements can be cancelled.'], 422);
        }

        $movement->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Movement cancelled.']);
    }

    public function show($id)
    {
        $movement = StockMovement::with(['product', 'enteredBy', 'confirmedBy'])->findOrFail($id);

        return response()->json($movement);
    }

    // Maintenance - request stock out
    public function requestStockOut(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'quantity' => 'required|integer|min:1',
            'reason' => 'required|string',
            'reference_no' => 'nullable|string',
        ]);

        $product = Product::findOrFail($validated['product_id']);

        if ($product->current_stock < $validated['quantity']) {
            return response()->json([
                'message' => 'Insufficient stock. Available: '.$product->current_stock.' '.$product->unit.'(s).',
            ], 422);
        }

        $movement = StockMovement::create([
            'product_id' => $validated['product_id'],
            'type' => 'stock_out',
            'quantity' => $validated['quantity'],
            'stock_before' => $product->current_stock,
            'stock_after' => $product->current_stock,
            'reference_no' => $validated['reference_no'] ?? null,
            'source' => 'maintenance',
            'reason' => $validated['reason'],
            'status' => 'pending',
            'entered_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Stock out request submitted. Waiting for Checker confirmation.',
            'movement' => $movement->load(['product', 'enteredBy']),
        ], 201);
    }
}
