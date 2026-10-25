<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One same-day change to a delivery (App\Support\DeliveryAdjust): an urgent
// top-up, or sacks added or reduced on one store's delivery. `changes` lists each
// product's quantity before and after.
class DeliveryAdjustment extends Model
{
    protected $fillable = ['delivery_id', 'kind', 'source', 'reason', 'changes', 'user_id'];

    protected $casts = ['changes' => 'array'];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
