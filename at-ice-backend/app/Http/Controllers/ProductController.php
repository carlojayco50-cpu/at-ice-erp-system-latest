<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    // Inventory = supplies and materials only (plastic bags, sacks, truck
    // parts, machine components). Ice is not inventoried.
    //
    // Stock levels are NEVER set here. current_stock only changes through
    // Stock In / Stock Out movements that a second Checker confirms
    // (double-entry, see StockMovementController). New items start at 0.

    public function index()
    {
        $products = Product::orderBy('name')->get();

        return response()->json($products);
    }

    // Next free code in the format SUP-0001, SUP-0002, ...
    private function nextProductCode(): string
    {
        $n = (Product::max('id') ?? 0) + 1;
        do {
            $code = 'SUP-'.str_pad($n, 4, '0', STR_PAD_LEFT);
            $n++;
        } while (Product::where('product_code', $code)->exists());

        return $code;
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_code' => 'nullable|string|max:50|unique:products,product_code',
            'name' => 'required|string|max:255|unique:products,name',
            'category' => 'nullable|string|max:100',
            'unit' => 'nullable|string|max:50',
            'unit_price' => 'nullable|numeric|min:0',
            'minimum_stock' => 'nullable|integer|min:0',
            'maximum_stock' => 'nullable|integer|min:0',
            'description' => 'nullable|string|max:1000',
        ], [
            'name.unique' => 'An item with this name already exists.',
        ]);

        if (isset($validated['minimum_stock'], $validated['maximum_stock'])
            && (int) $validated['maximum_stock'] < (int) $validated['minimum_stock']) {
            return response()->json([
                'message' => 'Maximum stock must be greater than or equal to the minimum stock.',
                'errors' => ['maximum_stock' => ['Maximum stock must be greater than or equal to the minimum stock.']],
            ], 422);
        }

        if (empty($validated['product_code'])) {
            $validated['product_code'] = $this->nextProductCode();
        }

        // Stock always starts at zero; it is added through a confirmed Stock In.
        $validated['current_stock'] = 0;

        $product = Product::create($validated);

        return response()->json($product, 201);
    }

    public function show($id)
    {
        $product = Product::with(['stockMovements.enteredBy', 'stockMovements.confirmedBy'])->findOrFail($id);

        return response()->json($product);
    }

    // Edits item details only. current_stock and product_code are not
    // editable here, so stock cannot be changed without double-entry.
    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('products', 'name')->ignore($product->id)],
            'category' => 'nullable|string|max:100',
            'unit' => 'nullable|string|max:50',
            'unit_price' => 'nullable|numeric|min:0',
            'minimum_stock' => 'nullable|integer|min:0',
            'maximum_stock' => 'nullable|integer|min:0',
            'description' => 'nullable|string|max:1000',
        ], [
            'name.unique' => 'An item with this name already exists.',
        ]);

        $min = array_key_exists('minimum_stock', $validated) ? $validated['minimum_stock'] : $product->minimum_stock;
        $max = array_key_exists('maximum_stock', $validated) ? $validated['maximum_stock'] : $product->maximum_stock;
        if ($min !== null && $max !== null && (int) $max < (int) $min) {
            return response()->json([
                'message' => 'Maximum stock must be greater than or equal to the minimum stock.',
                'errors' => ['maximum_stock' => ['Maximum stock must be greater than or equal to the minimum stock.']],
            ], 422);
        }

        $product->update($validated);

        return response()->json($product->fresh());
    }

    // An item that already has stock movements cannot be deleted, so the
    // inventory history stays complete.
    public function destroy($id)
    {
        $product = Product::findOrFail($id);

        if ($product->stockMovements()->exists()) {
            return response()->json([
                'message' => 'This item already has stock movements and cannot be deleted. Its history must be kept.',
            ], 422);
        }

        $product->delete();

        return response()->json(['message' => 'Product deleted.']);
    }
}
