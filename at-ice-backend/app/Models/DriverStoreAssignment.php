<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Which Driver handles a store, from effective_from to effective_to (null =
// until changed). Set by Admin; it applies to that store's deliveries from
// effective_from on (usually the next week or pay period).
class DriverStoreAssignment extends Model
{
    protected $fillable = ['driver_id', 'store_id', 'effective_from', 'effective_to', 'created_by'];

    protected $casts = [
        'effective_from' => 'date:Y-m-d',
        'effective_to' => 'date:Y-m-d',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function store()
    {
        return $this->belongsTo(Customer::class, 'store_id');
    }

    public function scopeActiveOn($q, string $date)
    {
        return $q->whereDate('effective_from', '<=', $date)
            ->where(fn ($w) => $w->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date));
    }

    // The Driver (users.id) assigned to this store on $date, or null.
    public static function driverFor(int $storeId, string $date): ?int
    {
        return self::activeOn($date)->where('store_id', $storeId)->latest('effective_from')->latest('id')->value('driver_id');
    }
}
