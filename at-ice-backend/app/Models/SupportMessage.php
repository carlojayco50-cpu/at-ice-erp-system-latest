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

    // A ticket moves open -> in_progress -> resolved -> closed (reopen sends it back to open).
    public const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

    public const PRIORITIES = ['low', 'medium', 'high'];

    // Topics that start as High: complaints about staff, urgent supply, missing sacks.
    public const HIGH_TOPICS = ['staff_conduct', 'emergency_supply', 'short_delivery'];

    // Never blocked by the ticket limits (one open ticket per topic, support.max_open_tickets).
    public const UNLIMITED_TOPICS = ['emergency_supply'];

    public const ACTIVE = ['open', 'in_progress'];

    // Questions that start as Low.
    public const LOW_TOPICS = ['price_inquiry', 'feedback', 'change_details', 'other'];

    protected $fillable = [
        'ticket_no',
        'customer_id',
        'user_id',
        'topic',
        'priority',
        'message',
        'status',
        'assigned_to',
        'resolved_by',
        'resolved_at',
        'resolution_note',
        'closed_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    protected $appends = ['topic_label'];

    public static function priorityFor(?string $topic): string
    {
        return in_array($topic, self::HIGH_TOPICS, true) ? 'high' : (in_array($topic, self::LOW_TOPICS, true) ? 'low' : 'medium');
    }

    // TKT-20261022-001: the day's next number.
    public static function nextTicketNo(): string
    {
        $prefix = 'TKT-'.now()->format('Ymd').'-';
        $last = self::where('ticket_no', 'like', $prefix.'%')->orderByDesc('ticket_no')->value('ticket_no');

        return $prefix.str_pad((string) ($last ? ((int) substr($last, -3)) + 1 : 1), 3, '0', STR_PAD_LEFT);
    }

    protected static function booted(): void
    {
        static::creating(function (SupportMessage $m) {
            $m->ticket_no ??= self::nextTicketNo();
            $m->priority ??= self::priorityFor($m->topic);
        });
    }

    public function getTopicLabelAttribute(): string
    {
        return self::TOPICS[$this->topic ?? ''] ?? (string) $this->topic;
    }

    public function replies()
    {
        return $this->hasMany(SupportReply::class)->orderBy('created_at')->orderBy('id');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
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
