<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Receipt;
use Illuminate\Http\Request;

class CustomerPortalController extends Controller
{
    private array $productTypes = ['bags', 'small_sack', 'big_sack'];

    private function resolveCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    // GET /api/my-profile
    public function myProfile(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        return response()->json([
            'name' => $customer->name,
            'customer_code' => $customer->customer_code,
            'branch_code' => $customer->branch_code,
            'address' => $customer->address,
            'city' => $customer->city,
            'province' => $customer->province,
            'contact_person' => $customer->contact_person,
            'contact_number' => $customer->contact_number,
            'email' => $customer->email,
            'mop' => $customer->mop,
        ]);
    }

    // GET /api/my-delivery-history
    // Named to avoid colliding with the Salesman's own GET /api/my-deliveries,
    // which is a completely different endpoint (DeliveryProofController@myDeliveries).
    public function myDeliveries(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        $deliveries = Delivery::with(['driver.employee', 'items.product', 'proofs.salesman'])
            ->where('customer_id', $customer->id)
            ->orderBy('scheduled_date', 'desc')
            ->get();

        $result = $deliveries->map(function ($delivery) {
            $driverName = $delivery->driver?->name;
            $plate = $delivery->driver?->employee?->vehicle_plate;
            $proof = $delivery->proofs->first();

            return [
                'id' => $delivery->id,
                'delivery_no' => $delivery->delivery_no,
                'status' => $delivery->status,
                'scheduled_date' => $delivery->scheduled_date,
                'dispatched_at' => $delivery->dispatched_at,
                'delivered_at' => $delivery->delivered_at,
                'notes' => $delivery->notes,
                // Plate number is folded into the display name on the server,
                // for example "Rhalf Valencia (PN: V7824)".
                'driver_name' => $plate ? "{$driverName} (PN: {$plate})" : $driverName,
                'confirmed_by' => $proof?->salesman?->name,
                'confirmed_at' => $proof?->confirmed_at,
                'items' => $delivery->items->map(function ($item) {
                    return [
                        // Ice deliveries use product_type (bags, small_sack,
                        // big_sack); older rows still use a products row.
                        'product_type' => $item->product_type,
                        'product_name' => $item->product_label,
                        'quantity_ordered' => $item->quantity_ordered,
                        'quantity_delivered' => $item->quantity_delivered,
                        'unit_price' => $item->unit_price,
                    ];
                }),
            ];
        });

        return response()->json($result);
    }

    // GET /api/my-receipts
    public function myReceipts(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        // delivery and customer are sent too, for the printable receipt.
        $receipts = Receipt::with(['items', 'delivery', 'customer'])
            ->where('customer_id', $customer->id)
            ->latest()
            ->get();

        return response()->json($receipts);
    }

    // GET /api/my-delivery-proofs
    public function myDeliveryProofs(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        $proofs = DeliveryProof::with(['delivery', 'salesman'])
            ->whereHas('delivery', fn ($q) => $q->where('customer_id', $customer->id))
            ->latest()
            ->get();

        return response()->json($proofs);
    }

    // GET /api/my-prices
    public function myPrices(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        $rows = CustomerPrice::where('customer_id', $customer->id)->get();

        $prices = collect($this->productTypes)->mapWithKeys(function ($type) use ($rows) {
            $row = $rows->firstWhere('product_type', $type);

            return [$type => $row ? (float) $row->unit_price : null];
        });

        return response()->json([
            'customer_name' => $customer->name,
            'prices' => $prices,
        ]);
    }
}
