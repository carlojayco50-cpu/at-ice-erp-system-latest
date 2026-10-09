<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    // Inquiry topics offered on the customer's Contact Support form (key => label).
    public const TOPICS = [
        'delivery_status' => 'Delivery Status & Schedule Confirmation',
        'emergency_supply' => 'Emergency Ice Shortage / Urgent Additional Sacks',
        'billing' => 'Billing, Receipt or Payment Clearance',
        'ice_quality' => 'Ice Quality / Temperature Verification',
        'contract_rate' => 'Contract Rate or Volume Discount Review',
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
