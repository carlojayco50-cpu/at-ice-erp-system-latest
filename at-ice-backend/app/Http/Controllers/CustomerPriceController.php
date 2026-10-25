<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\ReferencePrice;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// CRM > Customer Prices. Each customer type has reference prices (the
// client-confirmed table); a customer pays its type's reference price unless
// Admin set a price of its own (customer_prices), which can be reset back.
class CustomerPriceController extends Controller
{
    protected array $productTypes = ['bags', 'small_sack', 'big_sack'];

    // One customer's prices: what it pays per product, and whether that is
    // its own price ("custom") or its type's reference price ("reference").
    private function priceRow(Customer $customer, array $reference): array
    {
        $own = $customer->customerPrices->keyBy('product_type');
        $prices = [];
        $source = [];
        foreach ($this->productTypes as $type) {
            if ($own->has($type)) {
                $prices[$type] = (float) $own[$type]->unit_price;
                $source[$type] = 'custom';
            } else {
                $ref = $reference[$customer->customer_type][$type] ?? null;
                $prices[$type] = $ref;
                $source[$type] = $ref === null ? 'none' : 'reference';
            }
        }

        return [
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'branch_code' => $customer->branch_code,
            'customer_type' => $customer->customer_type,
            'chain' => $customer->chain,
            'prices' => $prices,
            'source' => $source,
            'reference' => $reference[$customer->customer_type] ?? null,
        ];
    }

    // GET /api/customer-prices: every customer with what it pays.
    public function index()
    {
        $reference = ReferencePrice::table();

        return response()->json(
            Customer::with('customerPrices')->orderBy('name')->get()->map(fn ($c) => $this->priceRow($c, $reference))
        );
    }

    // GET /api/customer-prices/{customer}
    public function show(Customer $customer)
    {
        return response()->json($this->priceRow($customer->load('customerPrices'), ReferencePrice::table()));
    }

    // GET /api/customer-prices/{customer}/lookup (Salesman confirmation)
    public function lookup(Customer $customer)
    {
        return $this->show($customer);
    }

    // PUT /api/customer-prices/{customer}
    // body: { prices: { bags: 25, small_sack: 150, big_sack: 250 } }
    // A price equal to the type's reference price is not stored, so the
    // customer keeps following the reference.
    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'prices' => 'required|array',
            'prices.bags' => 'nullable|numeric|min:0|max:100000',
            'prices.small_sack' => 'nullable|numeric|min:0|max:100000',
            'prices.big_sack' => 'nullable|numeric|min:0|max:100000',
        ]);

        $before = $customer->customerPrices()->pluck('unit_price', 'product_type')->all();
        foreach ($validated['prices'] as $productType => $unitPrice) {
            if ($unitPrice === null || ! in_array($productType, $this->productTypes, true)) {
                continue; // a blank does not remove a price (use Reset for that)
            }
            $ref = ReferencePrice::for($customer->customer_type, $productType);
            if ($ref !== null && abs($ref - (float) $unitPrice) < 0.005) {
                CustomerPrice::where('customer_id', $customer->id)->where('product_type', $productType)->delete();

                continue;
            }
            CustomerPrice::updateOrCreate(
                ['customer_id' => $customer->id, 'product_type' => $productType],
                ['unit_price' => $unitPrice]
            );
        }
        Audit::log('customer_prices.updated', $customer, $before, $validated['prices']);

        return $this->show($customer->fresh());
    }

    // DELETE /api/customer-prices/{customer}: back to the reference prices.
    public function reset(Customer $customer)
    {
        $before = $customer->customerPrices()->pluck('unit_price', 'product_type')->all();
        $customer->customerPrices()->delete();
        Audit::log('customer_prices.reset', $customer, $before, null);

        return $this->show($customer->fresh());
    }

    // GET /api/reference-prices
    public function referenceIndex()
    {
        return response()->json([
            'types' => Customer::TYPES,
            'prices' => ReferencePrice::table(),
        ]);
    }

    // PUT /api/reference-prices/{type}  body: { prices: { bags: 45, ... } }
    // A blank removes that reference price.
    public function referenceUpdate(Request $request, string $type)
    {
        if (! array_key_exists($type, Customer::TYPES)) {
            return response()->json(['message' => 'Unknown customer type.'], 404);
        }
        $validated = $request->validate([
            'prices' => ['required', Rule::array($this->productTypes)],
            'prices.*' => 'nullable|numeric|min:0|max:100000',
        ]);

        $before = ReferencePrice::table()[$type] ?? [];
        foreach ($this->productTypes as $product) {
            if (array_key_exists($product, $validated['prices'])) {
                ReferencePrice::updateOrCreate(
                    ['customer_type' => $type, 'product_type' => $product],
                    ['unit_price' => $validated['prices'][$product]]
                );
            }
        }
        Audit::log('reference_prices.updated', null, [$type => $before], [$type => $validated['prices']]);

        return $this->referenceIndex();
    }

    // POST /api/reference-prices/{type}/apply: every customer of this type
    // drops its own prices and follows the reference.
    public function referenceApply(string $type)
    {
        if (! array_key_exists($type, Customer::TYPES)) {
            return response()->json(['message' => 'Unknown customer type.'], 404);
        }
        $ids = Customer::where('customer_type', $type)->pluck('id');
        $removed = CustomerPrice::whereIn('customer_id', $ids)->delete();
        Audit::log('reference_prices.applied', null, null, ['customer_type' => $type, 'custom_prices_removed' => $removed]);

        return response()->json([
            'message' => "Successfully updated {$ids->count()} records: every ".Customer::TYPES[$type].' customer now uses the reference prices.',
        ]);
    }
}
