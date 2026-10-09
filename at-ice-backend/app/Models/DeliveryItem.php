<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryItem extends Model
{
    // Ice product types (same keys as Customer Prices and receipt items)
    public const PRODUCT_TYPES = [
        'bags' => 'Bags (5kg)',
        'small_sack' => 'Small Sack (30kg)',
        'big_sack' => 'Big Sack (50kg)',
    ];

    protected $fillable = [
        'delivery_id',
        'product_id',
        'product_type',
        'quantity_ordered',
        'quantity_delivered',
        'unit_price',
        'notes',
    ];

    // Sent with every item in JSON, so Driver, Salesman and Customer pages
    // can show a readable name without a products row.
    protected $appends = ['product_label'];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function getProductLabelAttribute(): string
    {
        if ($this->product_type) {
            return self::PRODUCT_TYPES[$this->product_type] ?? $this->product_type;
        }

        return $this->product?->name ?? '—';
    }
}
