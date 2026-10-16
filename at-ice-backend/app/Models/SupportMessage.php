<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    // Inquiry topics offered on the customer's Contact Support form (key => label).
    // Keep in sync with SUPPORT_TOPICS in at-ice-frontend/src/lib/company.js.
    // Older keys stay so earlier messages keep their labels.
    public const TOPICS = [
        'late_delivery' => 'Late or Missed Delivery',
        'delivery_status' => 'Delivery Status & Schedule Confirmation',
        'wrong_quantity' => 'Wrong Quantity Delivered',
        'short_delivery' => 'Short Delivery (Fewer Sacks Than Invoiced)',
        'damaged_ice' => 'Damaged or Melted Ice',
        'ice_quality' => 'Ice Quality / Temperature Verification',
        'emergency_supply' => 'Emergency Ice Shortage / Urgent Additional Sacks',
        'new_order' => 'New Order Request',
        'cancel_order' => 'Cancel an Order or Delivery',
        'change_schedule' => 'Change Delivery Schedule',
        'billing' => 'Invoice or Billing Error',
        'payment_proof' => 'Payment Proof Follow-up',
        'price_inquiry' => 'Price Inquiry',
        'contract_rate' => 'Contract Rate or Volume Discount Review',
        'change_details' => 'Change Address or Contact Details',
        'staff_conduct' => 'Rude Driver or Salesman',
        'account_login' => 'Account or Login Problem',
        'feedback' => 'Feedback or Suggestion',
        'other' => 'Other',
    ];

    protected $fillable = [
        'customer_id',
        'user_id',
        'topic',
        'message',
        'status',
        'resolved_by',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    protected $appends = ['topic_label'];

    public function getTopicLabelAttribute(): string
    {
        return self::TOPICS[$this->topic] ?? $this->topic;
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
