<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Delivery extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'delivery_no', 'driver_id', 'customer_id', 'delivery_type',
        'supplier_id', 'status', 'scheduled_date',
        'dispatched_at', 'delivered_at', 'notes', 'prepared_by',
    ];

    protected $casts = [
        'scheduled_date' => 'date',
        'dispatched_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    } // ✅ fixed

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function preparedBy()
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function items()
    {
        return $this->hasMany(DeliveryItem::class);
    }

    public function proofs()
    {
        return $this->hasMany(DeliveryProof::class);
    }
}
