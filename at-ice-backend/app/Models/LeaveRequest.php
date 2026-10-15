<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'leave_type',
        'start_date',
        'end_date',
        'total_days',
        'is_half_day',
        'reason',
        'status',
        'approved_by',
        'approved_at',
        'admin_notes',
        'attachment_path',
        'attachment_disk',
        'hours',
        'is_paid',
        'paid_days',
        'unpaid_days',
        'reject_reason',
    ];

    // date:Y-m-d so start/end dates are sent as plain "2026-10-01"
    // (no timezone shift when the frontend reads them)
    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'approved_at' => 'datetime',
        'is_half_day' => 'boolean',
        'is_paid' => 'boolean',
        'hours' => 'decimal:2',
        'paid_days' => 'decimal:2',
        'unpaid_days' => 'decimal:2',
    ];

    // Labels used in the rules and messages
    public const TYPE_LABELS = ['sick' => 'Sick leave (SL)', 'vacation' => 'Vacation leave (VL)', 'emergency' => 'Emergency leave (EL)'];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
