<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PickupLog extends Model
{
    protected $fillable = [
        'company_name',
        'product_type',
        'quantity',
        'recorded_by',
        'notes',
        'pickup_date',
    ];

    protected $casts = [
        'pickup_date' => 'datetime',
    ];

    public function recordedBy()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
