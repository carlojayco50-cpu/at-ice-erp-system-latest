<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'order_no', 'customer_id', 'prepared_by', 'status',
        'order_date', 'delivery_date', 'total_amount',
        'amount_paid', 'balance', 'payment_status', 'notes',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function preparedBy()
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function updatePaymentStatus(): void
    {
        if ($this->amount_paid <= 0) {
            $this->payment_status = 'unpaid';
        } elseif ($this->amount_paid < $this->total_amount) {
            $this->payment_status = 'partial';
        } else {
            $this->payment_status = 'paid';
        }
        $this->balance = max(0, $this->total_amount - $this->amount_paid);
        $this->save();
    }
}
