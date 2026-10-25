<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A store's request to change the sacks on one of its open deliveries
// (App\Support\DeliveryAdjust::requestChange). `items` lists each product's
// quantity on the delivery when asked (before) and the quantity wanted
// (after). Admin applies it (adjustment_id) or declines it (review_note).
class DeliveryAdjustmentRequest extends Model
{
    public const STATUSES = ['pending', 'applied', 'declined', 'withdrawn'];

    protected $fillable = ['delivery_id', 'customer_id', 'items', 'reason', 'status', 'review_note', 'reviewed_by', 'reviewed_at', 'adjustment_id', 'requested_by'];

    protected $casts = ['items' => 'array', 'reviewed_at' => 'datetime'];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function adjustment()
    {
        return $this->belongsTo(DeliveryAdjustment::class);
    }
}
