<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\LeaveRequest;
use Carbon\CarbonImmutable;

// Leave credits (docs/REVIEW-DECISIONS.md): once regular, an employee earns
// leave.credits_per_cutoff (0.5 day) for every pay period that ends, up to
// leave.credits_cap (15) a year. Credits do not carry over: the count starts
// again every January 1. Worked out when needed, so nothing has to run on a
// schedule. Paid days of approved leave in the year are subtracted.
class LeaveCredits
{
    // ['year', 'earned', 'used', 'available'] (days)
    public static function for(Employee $employee, ?string $asOf = null): array
    {
        $today = CarbonImmutable::parse($asOf ?? now(config('atice.timezone'))->toDateString());
        $out = ['year' => $today->year, 'earned' => 0.0, 'used' => 0.0, 'available' => 0.0];

        if ($employee->employment_status !== 'regular' || ! $employee->regularized_at) {
            return $out;
        }

        $from = CarbonImmutable::parse($employee->regularized_at)->max($today->startOfYear());
        $periods = 0;
        $p = PayPeriod::for($from->toDateString());
        while ($p['end'] <= $today->toDateString() && $periods < 30) {
            $periods++;
            $p = PayPeriod::for(CarbonImmutable::parse($p['end'])->addDay()->toDateString());
        }

        $earned = min((float) Settings::get('leave.credits_cap'), $periods * (float) Settings::get('leave.credits_per_cutoff'));
        $used = (float) LeaveRequest::where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereYear('start_date', $today->year)
            ->sum('paid_days');

        return [
            'year' => $today->year,
            'earned' => round($earned, 2),
            'used' => round($used, 2),
            'available' => round(max(0, $earned - $used), 2),
        ];
    }

    // A request's length in days: emergency leave is in hours.
    public static function days(LeaveRequest $leave): float
    {
        return $leave->leave_type === 'emergency' && $leave->hours !== null
            ? (float) $leave->hours / (float) Settings::get('payroll.hours_per_day')
            : (float) $leave->total_days;
    }
}
