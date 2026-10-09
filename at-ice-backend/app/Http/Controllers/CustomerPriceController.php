<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPrice;
use Illuminate\Http\Request;

class CustomerPriceController extends Controller
{
    protected array $productTypes = ['bags', 'small_sack', 'big_sack'];

    // GET /api/customer-prices
    // Overview list - every customer + whichever prices are set
    // Used by the Admin "Customer Price Management" table
    public function index()
    {
        $customers = Customer::with('customerPrices')->get();

        $result = $customers->map(function ($customer) {
            $prices = collect($this->productTypes)->mapWithKeys(function ($type) use ($customer) {
                $row = $customer->customerPrices->firstWhere('product_type', $type);

                return [$type => $row ? (float) $row->unit_price : null];
            });

            return [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'prices' => $prices,
            ];
        });

        return response()->json($result);
    }

    // GET /api/customer-prices/{customer}
    // Prices for a single customer, one key per product type
    public function show(Customer $customer)
    {
        $rows = CustomerPrice::where('customer_id', $customer->id)->get();

        $prices = collect($this->productTypes)->mapWithKeys(function ($type) use ($rows) {
            $row = $rows->firstWhere('product_type', $type);

            return [$type => $row ? (float) $row->unit_price : null];
        });

        return response()->json([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'prices' => $prices,
        ]);
    }

    // GET /api/customer-prices/{customer}/lookup
    public function lookup(Customer $customer)
    {
        return $this->show($customer);
    }

    // PUT /api/customer-prices/{customer}
    // Bulk upsert - body: { prices: { bags: 25, small_sack: 150, big_sack: 250 } }
    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'prices' => 'required|array',
            'prices.bags' => 'nullable|numeric|min:0',
            'prices.small_sack' => 'nullable|numeric|min:0',
            'prices.big_sack' => 'nullable|numeric|min:0',
        ]);

        foreach ($validated['prices'] as $productType => $unitPrice) {
            if ($unitPrice === null) {
                continue; // skip blanks — don't overwrite an existing price with null
            }

            if (! in_array($productType, $this->productTypes)) {
                continue;
            }

            CustomerPrice::updateOrCreate(
                ['customer_id' => $customer->id, 'product_type' => $productType],
                ['unit_price' => $unitPrice]
            );
        }

        return $this->show($customer);
    }
}
