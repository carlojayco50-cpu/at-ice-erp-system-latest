<?php

// app/Models/CustomerPrice.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerPrice extends Model
{
    use HasFactory;

    protected $fillable = ['customer_id', 'product_type', 'unit_price'];

    protected $casts = [
        'unit_price' => 'decimal:2',
    ];

    // product_type enum: bags, small_sack, big_sack
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    // when auto-pricing the multi-product confirmation form.
    public static function priceFor(int $customerId, string $productType): ?float
    {
        $row = static::where('customer_id', $customerId)
            ->where('product_type', $productType)
            ->first();
        if ($row) {
            return (float) $row->unit_price;
        }

        // No price of its own: the reference price of the customer's type.
        return ReferencePrice::for(Customer::whereKey($customerId)->value('customer_type'), $productType);
    }
}
