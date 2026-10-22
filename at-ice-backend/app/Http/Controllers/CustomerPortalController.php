<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryAdjustmentRequest;
use App\Models\DeliveryItem;
use App\Models\DeliveryProof;
use App\Models\Receipt;
use App\Support\DeliveryAdjust;
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

    // GET /api/my-delivery-notices: "may be delayed" notices of the last 7 days
    // (a delivery moved to another driver), App\Support\DeliveryDispatch.
    public function myDeliveryNotices(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        return response()->json(
            \App\Models\DeliveryNotification::where('customer_id', $customer->id)
                ->where('channel', 'portal')
                ->where('sent_at', '>=', now()->subDays(7))
                ->with('delivery:id,delivery_no,scheduled_date,status')
                ->latest('sent_at')
                ->get(['id', 'delivery_id', 'message', 'sent_at'])
        );
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

        $deliveries = Delivery::with(['driver.employee', 'items.product', 'proofs.salesman', 'adjustmentRequests'])
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
                'is_top_up' => (bool) $delivery->is_top_up,
                'ordered_at' => $delivery->ordered_at,
                // Plate number is folded into the display name on the server,
                // for example "Rhalf Valencia (PN: V7824)".
                'driver_name' => $plate ? "{$driverName} (PN: {$plate})" : $driverName,
                'confirmed_by' => $proof?->salesman?->name,
                'confirmed_at' => $proof?->confirmed_at,
                // the store's latest request to change the sacks, with Admin's answer
                'adjustment_request' => ($r = $delivery->adjustmentRequests->first()) ? [
                    'id' => $r->id,
                    'status' => $r->status,
                    'items' => $r->items,
                    'reason' => $r->reason,
                    'review_note' => $r->review_note,
                    'created_at' => $r->created_at,
                    'reviewed_at' => $r->reviewed_at,
                ] : null,
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

    // POST /api/my-deliveries/{id}/top-up (customer): today's delivery ran out;
    // ask for more sacks by a later time (App\Support\DeliveryAdjust::topUp)
    public function requestTopUp(Request $request, $id)
    {
        $customer = $this->resolveCustomer($request);
        $parent = $customer ? Delivery::where('customer_id', $customer->id)->find($id) : null;
        if (! $parent) {
            return response()->json(['message' => 'Delivery not found.'], 404);
        }
        $data = $request->validate([
            'items' => 'required|array',
            'items.*' => 'integer|min:0|max:500',
            'deliver_by' => 'required|date_format:H:i',
            'notes' => 'nullable|string|max:200',
        ]);
        $items = array_intersect_key($data['items'], DeliveryItem::PRODUCT_TYPES);

        $delivery = DeliveryAdjust::topUp($parent, $items, $data['deliver_by'], 'customer', $data['notes'] ?? null);

        return response()->json($delivery->load('items'), 201);
    }

    // POST /api/my-deliveries/{id}/adjustment-requests (customer): ask to change
    // the sacks on a delivery not yet delivered (rain, slow or fast sales).
    // items: [product_type => sacks wanted]; Admin applies or declines it.
    public function requestAdjustment(Request $request, $id)
    {
        $customer = $this->resolveCustomer($request);
        $delivery = $customer ? Delivery::where('customer_id', $customer->id)->find($id) : null;
        if (! $delivery) {
            return response()->json(['message' => 'Delivery not found.'], 404);
        }
        $data = $request->validate([
            'items' => 'required|array',
            'items.*' => 'integer|min:0|max:500',
            'reason' => 'required|string|min:3|max:200',
        ]);
        $wanted = array_intersect_key($data['items'], DeliveryItem::PRODUCT_TYPES);

        return response()->json(DeliveryAdjust::requestChange($delivery, $customer, $wanted, trim($data['reason'])), 201);
    }

    // POST /api/my-adjustment-requests/{id}/withdraw (customer): take back a
    // request Admin has not answered yet
    public function withdrawAdjustment(Request $request, $id)
    {
        $customer = $this->resolveCustomer($request);
        $row = $customer ? DeliveryAdjustmentRequest::with('delivery')->where('customer_id', $customer->id)->find($id) : null;
        if (! $row) {
            return response()->json(['message' => 'Request not found.'], 404);
        }

        return response()->json(DeliveryAdjust::withdrawRequest($row));
    }

    // GET /api/my-receipts
    public function myReceipts(Request $request)
    {
        $customer = $this->resolveCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        Receipt::markOverdue();

        // delivery and customer are sent too, for the printable receipt.
        $receipts = Receipt::with(['items', 'delivery', 'customer', 'paymentProofs'])
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
