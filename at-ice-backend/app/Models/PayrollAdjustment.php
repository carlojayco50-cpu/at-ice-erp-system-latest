<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// An extra earning on one payroll (bonus, incentive, referral bonus), added by
// Admin before the pay is released. Taxable or not.
class PayrollAdjustment extends Model
{
    protected $fillable = ['payroll_id', 'label', 'amount', 'taxable', 'created_by'];

    protected $casts = [
        'amount' => 'decimal:2',
        'taxable' => 'boolean',
    ];

    public function payroll()
    {
        return $this->belongsTo(Payroll::class);
    }
}
