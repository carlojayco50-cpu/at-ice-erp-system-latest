<?php

namespace App\Http\Controllers;

use App\Models\Delivery;
use App\Models\IceLoading;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class IceLoadingController extends Controller
{
    /**
     * Deliveries a Checker can count: pending or in transit, scheduled up to
     * today (the business day in config('atice.timezone'); a later booking is
     * not loaded yet). Each says whether it was already counted (and by whom)
     * so the form can disable it, plus the customer and driver.
     */
    public function deliveries()
    {
        $today = Carbon::now(config('atice.timezone'))->toDateString();

        $loaded = IceLoading::with('checker:id,name')
            ->orderBy('id')
            ->get()
            ->unique('delivery_id')
            ->keyBy('delivery_id');

        $rows = Delivery::with(['customer:id,name', 'driver:id,name'])
            ->whereIn('status', ['pending', 'in_transit'])
            ->whereDate('scheduled_date', '<=', $today)
            ->orderBy('scheduled_date')
            ->orderBy('id')
            ->limit(200)
            ->get(['id', 'delivery_no', 'customer_id', 'driver_id', 'status', 'scheduled_date'])
            ->map(fn ($d) => [
                'id' => $d->id,
                'delivery_no' => $d->delivery_no,
                'customer' => $d->customer?->name,
                'driver' => $d->driver?->name,
                'status' => $d->status,
                'scheduled_date' => $d->scheduled_date?->toDateString(),
                'loaded' => $loaded->has($d->id),
                'loaded_by' => $loaded->get($d->id)?->checker?->name,
            ]);

        return response()->json($rows);
    }

    private function alreadyLoaded(?IceLoading $loading)
    {
        $who = $loading?->checker?->name;

        return response()->json([
            'message' => 'This delivery\'s ice loading was already recorded'
                .($who ? " by {$who}" : '').'. A delivery can only be counted once.',
            'already_loaded' => true,
        ], 409);
    }

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
            'items.*.quantity' => 'required|integer|min:0|max:'.config('atice.max_product_quantity'),
        ], [
            'items.*.quantity.max' => 'Each product can have at most '.config('atice.max_product_quantity').' in one loading count.',
        ]);

        if (Delivery::whereKey($validated['delivery_id'])->value('status') === 'cancelled') {
            return response()->json(['message' => 'That delivery was cancelled.'], 422);
        }

        // The time is typed without a zone: it is local time, not UTC. Saved in the app's zone, which is how it is read back.
        $loadedAt = Carbon::parse($validated['loaded_at'], config('atice.timezone'))->setTimezone(config('app.timezone'));

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

        try {
            $created = DB::transaction(function () use ($validated, $itemsToSave, $loadedAt) {
                // Lock the delivery so two Checkers saving the same delivery
                // at once are handled one after the other.
                Delivery::whereKey($validated['delivery_id'])->lockForUpdate()->first();

                $existing = IceLoading::with('checker:id,name')
                    ->where('delivery_id', $validated['delivery_id'])
                    ->first();
                if ($existing) {
                    return $existing;
                }

                $rows = [];
                foreach ($itemsToSave as $item) {
                    $rows[] = IceLoading::create([
                        'delivery_id' => $validated['delivery_id'],
                        'product_type' => $item['product_type'],
                        'quantity_loaded' => $item['quantity'],
                        'loaded_at' => $loadedAt,
                        'checker_id' => auth()->id(),
                    ]);
                }

                return $rows;
            });
            if ($created instanceof IceLoading) {
                return $this->alreadyLoaded($created);
            }
        } catch (UniqueConstraintViolationException) {
            // The unique index caught a save that got past the check.
            return $this->alreadyLoaded(
                IceLoading::with('checker:id,name')->where('delivery_id', $validated['delivery_id'])->first()
            );
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
