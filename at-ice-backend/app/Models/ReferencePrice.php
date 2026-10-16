<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// The price a customer type pays when the customer has no price of its own
// (CRM > Customer Prices). unit_price null = no reference price.
class ReferencePrice extends Model
{
    protected $fillable = ['customer_type', 'product_type', 'unit_price'];

    protected $casts = ['unit_price' => 'float'];

    // [customer_type][product_type] => price or null
    public static function table(): array
    {
        $out = [];
        foreach (self::all() as $r) {
            $out[$r->customer_type][$r->product_type] = $r->unit_price;
        }

        return $out;
    }

    public static function for(?string $customerType, string $productType): ?float
    {
        if (! $customerType) {
            return null;
        }
        $price = self::where('customer_type', $customerType)->where('product_type', $productType)->value('unit_price');

        return $price === null ? null : (float) $price;
    }
}
