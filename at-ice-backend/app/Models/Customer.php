<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id', 'customer_code', 'name', 'branch_code', 'address',
        'block_lot', 'street', 'subdivision', 'barangay', 'postal_code', 'city',
        'province', 'latitude', 'longitude', 'contact_person', 'contact_number', 'email',
        'mop', 'is_active', 'notes',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function customerPrices()
    {
        return $this->hasMany(CustomerPrice::class);
    }
}
