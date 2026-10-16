<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A "your delivery may be late" notice sent to a store, one per delivery per
// channel (portal, email, sms).
class DeliveryNotification extends Model
{
    protected $fillable = ['customer_id', 'delivery_id', 'channel', 'message', 'sent_at'];

    protected $casts = ['sent_at' => 'datetime'];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }
}
