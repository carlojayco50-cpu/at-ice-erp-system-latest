<?php

namespace App\Http\Controllers;

use App\Events\DeliveryStatusUpdated;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class DeliveryController extends Controller
{
    public function index()
    {
        return response()->json(
            Delivery::with(['driver', 'customer', 'supplier', 'items.product', 'proofs'])->latest()->get()
        );
    }

    public function store(Request $request)
    {

        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'customer_id' => 'required_if:delivery_type,outbound|nullable|exists:customers,id',
            'delivery_type' => 'required|in:outbound,inbound',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'scheduled_date' => 'required|date|after_or_equal:today',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_type' => 'required|in:bags,small_sack,big_sack',
            'items.*.quantity_ordered' => 'required|integer|min:1',
        ], [
            'customer_id.required_if' => 'Please select a customer.',
        ]);

        // Each product type only once per delivery
        $types = array_column($data['items'], 'product_type');
        if (count($types) !== count(array_unique($types))) {
            return response()->json([
                'message' => 'Each product can only be added once per delivery.',
            ], 422);
        }

        // Unit price comes from Customer Prices, so the delivery and the
        // receipt the Salesman generates always use the same price.
        $items = [];
        $missing = [];
        foreach ($data['items'] as $item) {
            $price = $data['customer_id']
                ? CustomerPrice::priceFor($data['customer_id'], $item['product_type'])
                : null;

            if ($price === null) {
                $missing[] = $item['product_type'];

                continue;
            }

            $items[] = [
                'product_type' => $item['product_type'],
                'quantity_ordered' => $item['quantity_ordered'],
                'unit_price' => $price,
            ];
        }

        if (! empty($missing)) {
            return response()->json([
                'message' => 'No price has been set for this customer for: '
                    .implode(', ', $missing)
                    .'. Please set it in Customer Prices first.',
                'missing_price_products' => $missing,
            ], 422);
        }

        // Highest DEL-0000 number so far. LIKE + a PHP check instead of REGEXP,
        // which SQLite (local dev) does not have.
        $last = Delivery::withTrashed()
            ->where('delivery_no', 'like', 'DEL-____')
            ->pluck('delivery_no')
            ->filter(fn ($no) => preg_match('/^DEL-\d{4}$/', $no))
            ->max();

        $next = $last ? ((int) substr($last, 4)) + 1 : 1;
        $data['delivery_no'] = 'DEL-'.str_pad($next, 4, '0', STR_PAD_LEFT);

        $data['prepared_by'] = Auth::id();
        unset($data['items']);

        $delivery = DB::transaction(function () use ($data, $items) {
            $delivery = Delivery::create($data);

            foreach ($items as $item) {
                $delivery->items()->create($item);
            }

            return $delivery;
        });

        return response()->json($delivery->load(['driver', 'customer', 'items.product']), 201);
    }

    public function show($id)
    {
        return response()->json(
            Delivery::with(['driver', 'customer', 'supplier', 'items.product', 'proofs', 'preparedBy'])->findOrFail($id)
        );
    }

    public function cancel($id)
    {
        $delivery = Delivery::findOrFail($id);

        if ($delivery->status === 'delivered') {
            return response()->json(['message' => 'Cannot cancel a delivered delivery.'], 422);
        }

        $delivery->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Delivery cancelled']);
    }

    // Driver: can only START a delivery (pending to in_transit).
    // "Delivered" is set by the Salesman through DeliveryProofController@confirm.
    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:in_transit',
        ]);

        $delivery = Delivery::with(['customer', 'items.product', 'proofs'])->findOrFail($id);

        if ($delivery->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($delivery->status !== 'pending') {
            return response()->json(['message' => 'Only pending deliveries can be started.'], 422);
        }

        $delivery->update([
            'status' => 'in_transit',
            'dispatched_at' => now(),
        ]);

        broadcast(new DeliveryStatusUpdated([
            'delivery_id' => $delivery->id,
            'delivery_no' => $delivery->delivery_no,
            'driver_id' => $delivery->driver_id,
            'customer' => $delivery->customer?->name ?? 'Unknown',
            'status' => 'in_transit',
            'message' => "Delivery {$delivery->delivery_no} is now in_transit.",
        ]))->toOthers();

        return response()->json([
            'message' => 'Delivery status updated!',
            'delivery' => $delivery,
        ]);
    }

    // Salesman: view assigned deliveries (not yet confirmed)
    public function myDeliveries(Request $request)
    {
        $deliveries = Delivery::with(['driver', 'customer', 'items.product'])
            ->where('status', 'pending')
            ->whereDoesntHave('proofs')
            ->get();

        return response()->json($deliveries);
    }

    // Driver: view assigned deliveries
    public function driverDeliveries(Request $request)
    {
        $deliveries = Delivery::with(['customer', 'items.product', 'proofs'])
            ->where('driver_id', $request->user()->id)
            ->whereIn('status', ['pending', 'in_transit', 'delivered'])
            ->orderBy('scheduled_date', 'asc')
            ->get();

        return response()->json($deliveries);
    }
}
