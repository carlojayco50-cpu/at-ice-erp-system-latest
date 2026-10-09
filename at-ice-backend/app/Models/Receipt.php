<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Receipt extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_no',
        'delivery_id',
        'delivery_proof_id',
        'customer_id',
        'salesman_id',
        'quantity',
        'unit_price',
        'total_amount',
        'payment_status',
        'payment_method',
        'paid_at',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function deliveryProof()
    {
        return $this->belongsTo(DeliveryProof::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesman()
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    public function items()
    {
        return $this->hasMany(ReceiptItem::class);
    }

    public static function generateReceiptNo(): string
    {
        $date = now()->format('Ymd');
        $prefix = "RCP-{$date}-";

        $count = self::whereDate('created_at', today())->count() + 1;

        return $prefix.str_pad($count, 3, '0', STR_PAD_LEFT);
    }
}
