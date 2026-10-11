<?php

namespace App\Http\Controllers;

use App\Events\DeliveryStatusUpdated;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
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

        $data['prepared_by'] = Auth::id();
        unset($data['items']);

        // Retried when two deliveries made at the same moment get the same number.
        for ($attempt = 1; ; $attempt++) {
            try {
                $delivery = DB::transaction(function () use ($data, $items) {
                    // No double booking: one delivery per customer per day. Only a
                    // cancelled one frees the day. The customer row is locked so two
                    // Admins booking the same day at the same moment cannot both pass.
                    if (! empty($data['customer_id'])) {
                        Customer::whereKey($data['customer_id'])->lockForUpdate()->first();
                        $booked = Delivery::where('customer_id', $data['customer_id'])
                            ->whereDate('scheduled_date', $data['scheduled_date'])
                            ->where('status', '!=', 'cancelled')
                            ->first();
                        if ($booked) {
                            return $booked;
                        }
                    }

                    $delivery = Delivery::create($data + ['delivery_no' => self::nextDeliveryNo()]);

                    foreach ($items as $item) {
                        $delivery->items()->create($item);
                    }

                    return $delivery;
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 3) {
                    throw $e;
                }
            }
        }

        // An existing booking came back instead of a new delivery.
        if (! $delivery->wasRecentlyCreated) {
            $day = Carbon::parse($data['scheduled_date'])->format('M j, Y');
            $text = "This customer already has delivery {$delivery->delivery_no} ({$delivery->status}) on {$day}. Cancel it first, or pick another date.";

            return response()->json(['message' => $text, 'errors' => ['scheduled_date' => [$text]]], 422);
        }

        return response()->json($delivery->load(['driver', 'customer', 'items.product']), 201);
    }

    // Highest DEL-0000 number so far, plus 1. LIKE + a PHP check instead of
    // REGEXP, which SQLite (local dev) does not have.
    private static function nextDeliveryNo(): string
    {
        $last = Delivery::withTrashed()
            ->where('delivery_no', 'like', 'DEL-____')
            ->pluck('delivery_no')
            ->filter(fn ($no) => preg_match('/^DEL-\d{4}$/', $no))
            ->max();

        $next = $last ? ((int) substr($last, 4)) + 1 : 1;

        return 'DEL-'.str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    public function show($id)
    {
        return response()->json(
            Delivery::with(['driver', 'customer', 'supplier', 'items.product', 'proofs', 'preparedBy'])->findOrFail($id)
        );
    }

    public function cancel($id)
    {
        // Locked so a cancel cannot cross a Salesman confirmation in progress
        // (DeliveryProofController@confirm locks the same row).
        $status = DB::transaction(function () use ($id) {
            $delivery = Delivery::lockForUpdate()->findOrFail($id);
            if ($delivery->status !== 'delivered') {
                $delivery->update(['status' => 'cancelled']);
            }

            return $delivery->status;
        });

        if ($status === 'delivered') {
            return response()->json(['message' => 'Cannot cancel a delivered delivery.'], 422);
        }

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
