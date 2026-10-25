<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One delivery schedule per customer (a whole chain such as SM, or one store):
// a date range and the days of the week it is delivered. Admin approves it,
// and App\Support\DeliveryDispatch::generate makes the daily deliveries.
class DeliveryContract extends Model
{
    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    protected $fillable = [
        'contract_no', 'name', 'chain', 'start_date', 'end_date', 'delivery_days',
        'delivery_time', 'items', 'status', 'notes', 'created_by', 'approved_by', 'approved_at',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'delivery_days' => 'array',
        'items' => 'array',
        'approved_at' => 'datetime',
    ];

    public function stores()
    {
        return $this->belongsToMany(Customer::class, 'delivery_contract_stores', 'delivery_contract_id', 'customer_id');
    }

    public function deliveries()
    {
        return $this->hasMany(Delivery::class, 'contract_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
