<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// The Driver or the Salesman pressed Arrived at the store, with the phone's GPS
// and how far it was from the store pin (App\Http\Controllers\DeliveryArrivalController).
class DeliveryArrival extends Model
{
    protected $fillable = ['delivery_id', 'user_id', 'role', 'latitude', 'longitude', 'accuracy_m', 'distance_m', 'arrived_at'];

    protected $casts = [
        'arrived_at' => 'datetime',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
