<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'supplier_code', 'name', 'contact_person', 'contact_number',
        'email', 'address', 'barangay', 'barangay_code', 'city', 'province', 'region',
        'status', 'notes',
    ];

    public function deliveries()
    {
        return $this->hasMany(Delivery::class);
    }
}
