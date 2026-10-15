<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\Payroll;

// 13th month pay (PD 851): the basic salary actually earned in the calendar
// year, less unpaid absences, unpaid leave and tardiness, divided by 12.
// Prorated by nature from the hire date, since only pay periods worked count.
// Basic salary only: allowances and adjustments (bonuses) are not included.
// Credited on thirteenth.credit_date (default Dec 1; legal deadline Dec 24).
//
// TODO: needs the adviser's confirmation. The reviewer's example worked it out
// as (monthly / 12 x months) - (unpaid hours x hourly); this uses the legal
// formula, which gives the same result when both start from the same figures:
// hired in June at 16,000 a month (96,000 basic for 6 months), 26 unpaid hours
// at 91.62 an hour: (96,000 - 2,382.12) / 12 = 7,801.49.
class ThirteenthMonth
{
    public static function formula(float $basicEarned, float $unpaidDeductions): float
    {
        return Money::round(max(0, $basicEarned - $unpaidDeductions) / 12);
    }

    // From the year's payrolls (pay periods ending in that year).
    // ['basic' => total basic earned, 'deductions' => unpaid absences, leave and tardiness, 'amount' => 13th month]
    public static function for(Employee $employee, int $year): array
    {
        $rows = Payroll::where('employee_id', $employee->id)
            ->whereYear('period_end', $year)
            ->get(['basic_pay', 'paid_leave_pay', 'late_deduction', 'absence_deduction', 'leave_deduction']);

        $basic = (float) $rows->sum(fn ($p) => (float) $p->basic_pay + (float) $p->paid_leave_pay);
        $deductions = (float) $rows->sum(fn ($p) => (float) $p->late_deduction + (float) $p->absence_deduction + (float) $p->leave_deduction);

        return [
            'basic' => Money::round($basic),
            'deductions' => Money::round($deductions),
            'amount' => self::formula($basic, $deductions),
            'periods' => $rows->count(),
        ];
    }
}
