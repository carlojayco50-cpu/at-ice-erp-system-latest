<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

// One employee's pay for one pay period. Worked out by
// App\Support\PayrollCalculator when HR approves the timesheet; status is
// "unpaid" (approved, waiting for pay) until Admin marks it "paid" (final).
class Payroll extends Model
{
    use HasFactory;

    public const MONEY = [
        'daily_rate', 'monthly_rate', 'hourly_rate', 'basic_pay', 'paid_leave_pay', 'holiday_pay', 'holiday_ot_pay', 'overtime_pay', 'late_deduction', 'absence_deduction',
        'leave_deduction', 'adjustments_total', 'gross_pay', 'sss_deduction', 'philhealth_deduction', 'pagibig_deduction',
        'tax_deduction', 'other_deductions', 'taxable_income', 'net_pay', 'carry_over_in', 'carry_over_out', 'employer_shouldered',
    ];

    protected $fillable = [
        'employee_id', 'period_start', 'period_end', 'pay_day',
        'days_worked', 'days_present', 'absent_days', 'late_minutes', 'paid_leave_days', 'unpaid_leave_days', 'unpaid_leave_hours', 'holiday_hours', 'ot_hours',
        'daily_rate', 'pay_basis', 'monthly_rate', 'hourly_rate',
        'basic_pay', 'paid_leave_pay', 'holiday_pay', 'holiday_ot_pay', 'overtime_pay', 'late_deduction', 'absence_deduction', 'leave_deduction', 'adjustments_total',
        'gross_pay', 'sss_deduction', 'philhealth_deduction', 'pagibig_deduction', 'tax_deduction', 'other_deductions',
        'taxable_income', 'net_pay', 'carry_over_in', 'carry_over_out', 'employer_shouldered',
        'status', 'prepared_by', 'timesheet_approved_by', 'timesheet_approved_at', 'paid_at', 'paid_by',
    ];

    // R3: payroll notes are no longer used; the old column is never sent.
    protected $hidden = ['notes'];

    // date:Y-m-d so pay periods are sent as plain "2026-10-01"
    // (no timezone shift when the frontend reads them)
    protected $casts = [
        'period_start' => 'date:Y-m-d',
        'period_end' => 'date:Y-m-d',
        'pay_day' => 'date:Y-m-d',
        'paid_at' => 'datetime',
        'timesheet_approved_at' => 'datetime',
        'days_present' => 'decimal:2',
        'absent_days' => 'decimal:2',
        'paid_leave_days' => 'decimal:2',
        'unpaid_leave_days' => 'decimal:2',
        'unpaid_leave_hours' => 'decimal:2',
        'daily_rate' => 'decimal:2',
        'monthly_rate' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'basic_pay' => 'decimal:2',
        'paid_leave_pay' => 'decimal:2',
        'holiday_pay' => 'decimal:2',
        'holiday_ot_pay' => 'decimal:2',
        'overtime_pay' => 'decimal:2',
        'holiday_hours' => 'decimal:2',
        'ot_hours' => 'decimal:2',
        'late_deduction' => 'decimal:2',
        'absence_deduction' => 'decimal:2',
        'leave_deduction' => 'decimal:2',
        'adjustments_total' => 'decimal:2',
        'gross_pay' => 'decimal:2',
        'sss_deduction' => 'decimal:2',
        'philhealth_deduction' => 'decimal:2',
        'pagibig_deduction' => 'decimal:2',
        'tax_deduction' => 'decimal:2',
        'other_deductions' => 'decimal:2',
        'taxable_income' => 'decimal:2',
        'net_pay' => 'decimal:2',
        'carry_over_in' => 'decimal:2',
        'carry_over_out' => 'decimal:2',
        'employer_shouldered' => 'decimal:2',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function preparedBy()
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function adjustments()
    {
        return $this->hasMany(PayrollAdjustment::class);
    }
}
