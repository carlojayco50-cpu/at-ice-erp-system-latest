<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A customer's proof of payment for an invoice (Receipt). Admin approves it
// (the invoice becomes paid) or rejects it with a reason (the invoice stays
// unpaid and its overdue count goes on). The file is on the private disk and
// opened only through payment-proofs/{id}/file or my-payment-proofs/{id}/file.
class PaymentProof extends Model
{
    public const METHODS = [
        'gcash' => 'GCash',
        'maya' => 'Maya',
        'bank_transfer' => 'Bank Transfer',
        'check' => 'Cheque',
        'cash' => 'Cash',
        'other' => 'Other',
    ];

    // Photo or PDF, up to 5 MB.
    public const FILE_RULE = 'required|file|mimes:png,jpg,jpeg,webp,pdf|max:5120';

    protected $fillable = [
        'receipt_id', 'customer_id', 'submitted_by', 'file_path', 'file_disk', 'original_name',
        'method', 'reference_no', 'status', 'reject_reason', 'reviewed_by', 'reviewed_at',
    ];

    protected $hidden = ['file_path', 'file_disk'];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    protected $appends = ['is_pdf', 'method_label'];

    public function getIsPdfAttribute(): bool
    {
        return str_ends_with(strtolower((string) $this->file_path), '.pdf');
    }

    public function getMethodLabelAttribute(): ?string
    {
        return $this->method ? (self::METHODS[$this->method] ?? $this->method) : null;
    }

    public function receipt()
    {
        return $this->belongsTo(Receipt::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
