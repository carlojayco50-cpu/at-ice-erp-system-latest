<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Delivery extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'delivery_no', 'contract_id', 'driver_id', 'reassigned_from_driver_id', 'customer_id', 'delivery_type',
        'supplier_id', 'status', 'scheduled_date', 'ordered_at',
        'dispatched_at', 'delivered_at', 'notes', 'cancel_reason', 'prepared_by',
    ];

    // pending: waiting for its Driver to start it; queued: no Driver was free
    // when its Driver went on leave, waits (LIFO: latest ordered_at first) for the first
    // Driver who becomes available; in_transit; delivered; cancelled.
    public const STATUSES = ['pending', 'queued', 'in_transit', 'delivered', 'cancelled'];

    protected $casts = [
        'scheduled_date' => 'date',
        'ordered_at' => 'datetime',
        'dispatched_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function reassignedFrom()
    {
        return $this->belongsTo(User::class, 'reassigned_from_driver_id');
    }

    public function contract()
    {
        return $this->belongsTo(DeliveryContract::class, 'contract_id');
    }

    public function notifications()
    {
        return $this->hasMany(DeliveryNotification::class);
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

    // The Driver and the Salesman pressing Arrived at the store (GPS checked).
    public function arrivals()
    {
        return $this->hasMany(DeliveryArrival::class);
    }
}
