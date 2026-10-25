<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// The Driver (truck) a Salesman rides with on a day (App\Support\DeliveryRoute).
class DeliveryCrew extends Model
{
    protected $fillable = ['date', 'salesman_id', 'driver_id', 'chosen_by'];

    protected $casts = ['date' => 'date'];

    public function salesman()
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
