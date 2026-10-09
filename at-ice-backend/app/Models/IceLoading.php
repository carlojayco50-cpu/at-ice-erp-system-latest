<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IceLoading extends Model
{
    protected $fillable = [
        'delivery_id',
        'product_type',
        'checker_id',
        'quantity_loaded',
        'loaded_at',
    ];

    protected $casts = [
        'loaded_at' => 'datetime',
    ];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function checker()
    {
        return $this->belongsTo(User::class, 'checker_id');
    }
}
