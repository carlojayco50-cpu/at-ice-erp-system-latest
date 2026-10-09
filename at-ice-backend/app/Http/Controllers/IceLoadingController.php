<?php

namespace App\Http\Controllers;

use App\Models\IceLoading;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class IceLoadingController extends Controller
{
    public function index(Request $request)
    {
        $query = IceLoading::with(['delivery.customer', 'checker:id,name'])
            ->orderBy('loaded_at', 'desc');

        if ($request->filled('delivery_id')) {
            $query->where('delivery_id', $request->delivery_id);
        }

        if ($request->filled('product_type')) {
            $query->where('product_type', $request->product_type);
        }

        return response()->json($query->paginate(50));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'delivery_id' => 'required|exists:deliveries,id',
            'loaded_at' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.product_type' => 'required|in:bags,small_sack,big_sack',
            'items.*.quantity' => 'required|integer|min:0',
        ]);

        $productTypes = array_column($validated['items'], 'product_type');
        if (count($productTypes) !== count(array_unique($productTypes))) {
            return response()->json([
                'message' => 'Each product type can only be entered once per loading count.',
            ], 422);
        }

        $itemsToSave = array_values(array_filter(
            $validated['items'],
            fn ($item) => $item['quantity'] > 0
        ));

        if (empty($itemsToSave)) {
            return response()->json([
                'message' => 'Please enter at least one quantity greater than zero.',
            ], 422);
        }

        $created = [];

        DB::beginTransaction();
        try {
            foreach ($itemsToSave as $item) {
                $created[] = IceLoading::create([
                    'delivery_id' => $validated['delivery_id'],
                    'product_type' => $item['product_type'],
                    'quantity_loaded' => $item['quantity'],
                    'loaded_at' => $validated['loaded_at'],
                    'checker_id' => auth()->id(),
                ]);
            }
            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Something went wrong. Please try again.',
                'error' => $e->getMessage(),
            ], 500);
        }

        $loaded = collect($created)->map(
            fn ($row) => $row->load(['delivery.customer', 'checker:id,name'])
        );

        return response()->json([
            'message' => 'Ice loading count recorded.',
            'loadings' => $loaded,
            'total_loaded' => array_sum(array_column($itemsToSave, 'quantity')),
        ], 201);
    }

    public function show(IceLoading $iceLoading)
    {
        return response()->json(
            $iceLoading->load(['delivery.customer', 'checker:id,name'])
        );
    }
}
