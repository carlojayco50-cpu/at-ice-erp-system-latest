<?php

namespace App\Http\Controllers;

use App\Events\DeliveryStatusUpdated;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Receipt;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class DeliveryProofController extends Controller
{
    public function index()
    {
        $proofs = DeliveryProof::with([
            'delivery.customer',
            'salesman',
            'receipt.items',
        ])->latest()->get();

        return response()->json($proofs);
    }

    public function show($id)
    {
        $proof = DeliveryProof::with([
            'delivery.customer',
            'salesman',
            'receipt.items',
        ])->findOrFail($id);

        return response()->json($proof);
    }

    public function confirm(Request $request)
    {
        $validated = $request->validate([
            'delivery_id' => 'required|exists:deliveries,id',
            'products' => 'required|array|min:1',
            'products.*.product_type' => 'required|in:bags,small_sack,big_sack',
            // 500 at most per product, the same limit as the Salesman's form
            'products.*.quantity' => 'required|integer|min:1|max:500',
            'photo' => 'required|image|mimes:jpg,jpeg,png|max:5120',
        ]);

        // Reject duplicate product_type entries in the same submission
        $productTypes = array_column($validated['products'], 'product_type');
        if (count($productTypes) !== count(array_unique($productTypes))) {
            return response()->json([
                'message' => 'Each product type can only be entered once per delivery.',
            ], 422);
        }

        $alreadyConfirmed = DeliveryProof::where('delivery_id', $request->delivery_id)->exists();
        if ($alreadyConfirmed) {
            return response()->json([
                'message' => 'This delivery has already been confirmed.',
            ], 422);
        }

        $delivery = Delivery::with('customer')->findOrFail($request->delivery_id);

        // Only a delivery the Driver has started (in_transit) can be confirmed:
        // a pending one has not left the plant yet, and a cancelled (or
        // otherwise closed) delivery must never produce a receipt.
        if ($delivery->status === 'pending') {
            return response()->json([
                'message' => 'The driver has not started this delivery yet. You can confirm it once it is In Transit.',
            ], 422);
        }
        if ($delivery->status !== 'in_transit') {
            return response()->json([
                'message' => "This delivery cannot be confirmed because it is {$delivery->status}.",
            ], 422);
        }

        // Look up prices BEFORE starting the transaction / storing the photo,
        // fail fast if any product has no price set for this customer.
        $lineItems = [];
        $missingPrices = [];

        foreach ($validated['products'] as $line) {
            $unitPrice = CustomerPrice::priceFor($delivery->customer_id, $line['product_type']);

            if ($unitPrice === null) {
                $missingPrices[] = $line['product_type'];

                continue;
            }

            $lineItems[] = [
                'product_type' => $line['product_type'],
                'quantity' => $line['quantity'],
                'unit_price' => $unitPrice,
                'line_total' => round($line['quantity'] * $unitPrice, 2),
            ];
        }

        if (! empty($missingPrices)) {
            return response()->json([
                'message' => 'No price has been set for the following product(s) for this customer: '
                    .implode(', ', $missingPrices)
                    .'. Please ask Admin to set pricing in Customer Prices before confirming.',
                'missing_price_products' => $missingPrices,
            ], 422);
        }

        $photoPath = null;
        $totalQuantity = array_sum(array_column($lineItems, 'quantity'));
        $totalAmount = array_sum(array_column($lineItems, 'line_total'));

        try {
            $photoPath = $request->file('photo')->store('delivery_proofs', 'public');

            // Retried when two receipts made at the same moment get the same number.
            for ($attempt = 1; ; $attempt++) {
                try {
                    [$proof, $receipt, $refusal] = DB::transaction(function () use ($request, $lineItems, $photoPath, $totalQuantity, $totalAmount) {
                        // Lock the delivery and check it again: a second confirmation
                        // sent at the same moment, or an Admin cancel, waits here and
                        // then sees the new state.
                        $locked = Delivery::lockForUpdate()->findOrFail($request->delivery_id);
                        if ($locked->status !== 'in_transit') {
                            return [null, null, "This delivery cannot be confirmed because it is {$locked->status}."];
                        }
                        if (DeliveryProof::where('delivery_id', $locked->id)->exists()) {
                            return [null, null, 'This delivery has already been confirmed.'];
                        }

                        $proof = DeliveryProof::create([
                            'delivery_id' => $locked->id,
                            'salesman_id' => auth()->id(),
                            'quantity' => $totalQuantity,
                            'photo_path' => $photoPath,
                            'confirmed_at' => now(),
                        ]);

                        $receipt = Receipt::create([
                            'receipt_no' => Receipt::generateReceiptNo($locked->customer),
                            'delivery_id' => $locked->id,
                            'delivery_proof_id' => $proof->id,
                            'customer_id' => $locked->customer_id,
                            'salesman_id' => auth()->id(),
                            'quantity' => $totalQuantity,
                            'unit_price' => null, // multi-product, see receipt_items for breakdown
                            'total_amount' => $totalAmount,
                            'payment_status' => 'unpaid',
                        ]);

                        foreach ($lineItems as $item) {
                            $receipt->items()->create($item);
                        }

                        $locked->update([
                            'status' => 'delivered',
                            'delivered_at' => now(),
                        ]);

                        return [$proof, $receipt, null];
                    });
                    break;
                } catch (UniqueConstraintViolationException $e) {
                    if ($attempt >= 3) {
                        throw $e;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Remove the uploaded photo so a failed confirmation leaves no file behind
            if ($photoPath) {
                Storage::disk('public')->delete($photoPath);
            }

            // Details go to the server log only, never to the browser
            Log::error('Delivery confirmation failed', [
                'delivery_id' => $request->delivery_id,
                'user_id' => auth()->id(),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Something went wrong. Please try again.',
            ], 500);
        }

        if ($refusal) {
            Storage::disk('public')->delete($photoPath);

            return response()->json(['message' => $refusal], 422);
        }

        try {
            broadcast(new DeliveryStatusUpdated([
                'delivery_id' => $delivery->id,
                'delivery_no' => $delivery->delivery_no,
                'driver_id' => $delivery->driver_id,
                'customer' => $delivery->customer?->name ?? 'Unknown',
                'status' => 'delivered',
                'message' => "Delivery {$delivery->delivery_no} is now delivered.",
            ]))->toOthers();
        } catch (\Throwable $e) {
            Log::warning('Delivery confirmed but live update failed', [
                'delivery_id' => $delivery->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'message' => 'Delivery confirmed successfully!',
            'proof' => $proof,
            'receipt' => $receipt->load('items'),
        ], 201);
    }

    // Salesman: deliveries still waiting for confirmation
    // (Driver may or may not have started them yet)
    public function myDeliveries()
    {
        // Open deliveries still waiting for a confirmation...
        $open = Delivery::with(['customer', 'items.product'])
            ->whereIn('status', ['pending', 'in_transit'])
            ->whereDoesntHave('proofs')
            ->orderBy('created_at', 'desc')
            ->get();

        // ...plus the ones this Salesman confirmed, with the proof and receipt,
        // so they show under the Salesman's Delivered tab.
        $salesmanId = request()->user()->id;
        $confirmed = Delivery::with([
            'customer', 'items.product',
            'proofs' => fn ($q) => $q->where('salesman_id', $salesmanId)->with('receipt.items'),
        ])
            ->where('status', 'delivered')
            ->whereHas('proofs', fn ($q) => $q->where('salesman_id', $salesmanId))
            ->orderByDesc('delivered_at')
            ->limit(200)
            ->get();

        return response()->json($open->concat($confirmed)->values());
    }
}
