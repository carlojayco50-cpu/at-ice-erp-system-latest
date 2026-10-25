<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A day a Driver cannot drive: absent, emergency leave or rest day. Their
// pending deliveries that day go to another Driver (App\Support\DeliveryDispatch).
class DriverLeave extends Model
{
    public const TYPES = ['absent' => 'Absent', 'emergency' => 'Emergency leave', 'rest_day' => 'Rest day'];

    protected $fillable = ['driver_id', 'date', 'type', 'reason', 'recorded_by'];

    protected $casts = ['date' => 'date:Y-m-d'];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
