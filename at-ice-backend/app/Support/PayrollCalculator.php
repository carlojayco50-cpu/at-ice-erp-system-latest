<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\ContributionRate;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\PayMultiplier;
use App\Models\Payroll;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;

// Works out one employee's pay for one pay period (docs/REVIEW-DECISIONS.md).
// Everything is computed at full precision; only the stored amounts are
// rounded to centavos (App\Support\Money).
//
// Timesheet (from attendance and approved leave in the period)
//   days present    a day with a Time In; 0.5 when its hours are under 4
//   late minutes    from each Time In (App\Support\Lateness)
//   absent days     work days (attendance.work_days) up to today with no Time
//                   In and no approved leave, from the hire date on
//   leave           paid and unpaid days of approved leave in the period;
//                   emergency leave in hours
// Pay
//   daily rate      basic = days present x daily rate; paid leave days are
//                   added; unpaid EL hours are deducted (the day itself was
//                   worked); absences and unpaid SL/VL simply earn nothing
//   monthly rate    basic = monthly x 12 / 26 per period (from the hire date
//                   for a mid-period hire); absences and unpaid leave days are
//                   deducted at the daily rate, unpaid EL hours at the hourly
//   late            late minutes x per-minute rate (both)
//   adjustments     bonus, incentive, referral... (taxable or not)
// Government (mandatory; employee shares from contribution_rates on the pay day)
//   monthly amounts, deducted by payroll.gov_deduction_strategy:
//   FIRST_PAYROLL_OF_MONTH  all on the first pay day of the month
//   SPLIT_FIRST_TWO         half on the 1st and 2nd pay days, none on a 3rd
// Withholding tax (TRAIN): the period's taxable income x 26 = yearly; tax on
//   that from the brackets, / 26. Zero up to 250,000 a year.
// To move to semi-monthly cutoffs later, only PayPeriod, PERIODS_PER_YEAR and
// the settings change.
class PayrollCalculator
{
    public const PERIODS_PER_YEAR = 26;

    // The values to store on the Payroll row (see the payrolls columns).
    public static function compute(Employee $employee, array $period, array $adjustments = []): array
    {
        $start = CarbonImmutable::parse($period['start']);
        $end = CarbonImmutable::parse($period['end']);
        $payDay = $period['pay_day'] ?? PayPeriod::for($period['start'])['pay_day'];
        $hpd = (float) Settings::get('payroll.hours_per_day');

        $daily = Rates::dailyFor($employee->pay_basis, (float) $employee->daily_rate, $employee->monthly_rate !== null ? (float) $employee->monthly_rate : null);
        $hourly = Rates::hourly($daily);
        $perMinute = $hourly / 60;
        $monthly = $employee->pay_basis === 'monthly' && $employee->monthly_rate ? (float) $employee->monthly_rate : null;

        $sheet = self::timesheet($employee, $start, $end);

        if ($monthly !== null) {
            $hiredMid = CarbonImmutable::parse($employee->date_hired)->greaterThan($start);
            $basic = $hiredMid ? $daily * $sheet['work_days_since_hire'] : $monthly * 12 / self::PERIODS_PER_YEAR;
            $paidLeavePay = 0.0;
            $absence = $sheet['absent_days'] * $daily;
            $leaveDeduction = $sheet['unpaid_leave_days'] * $daily + $sheet['unpaid_leave_hours'] * $hourly;
        } else {
            // Holiday days are paid as holiday pay below, not as basic.
            $basic = max(0, $sheet['days_present'] - $sheet['holiday_days_present']) * $daily;
            $paidLeavePay = $sheet['paid_leave_days'] * $daily;
            $absence = 0.0;
            $leaveDeduction = $sheet['unpaid_leave_hours'] * $hourly;
        }
        $late = $sheet['late_minutes'] * $perMinute;

        $hp = self::holidayPay($sheet, $hourly, $daily, $monthly !== null, $hpd);
        $absence += $hp['monthly_unworked_deduction'];

        $adjTotal = 0.0;
        $adjNonTaxable = 0.0;
        foreach ($adjustments as $a) {
            $adjTotal += (float) $a['amount'];
            if (empty($a['taxable'])) {
                $adjNonTaxable += (float) $a['amount'];
            }
        }

        $gross = max(0, $basic + $paidLeavePay + $hp['holiday_pay'] + $hp['holiday_ot_pay'] + $hp['overtime_pay'] + $adjTotal - $late - $absence - $leaveDeduction);

        $gov = self::government($monthly ?? $daily * (float) Settings::get('payroll.monthly_to_daily_divisor'), $payDay);
        $taxable = max(0, $gross - $adjNonTaxable - $gov['sss'] - $gov['philhealth'] - $gov['pagibig']);
        $tax = self::withholdingTax($taxable, $payDay);
        $net = $gross - $gov['sss'] - $gov['philhealth'] - $gov['pagibig'] - $tax;

        // Net pay is never negative (R3). A shortfall from the previous
        // cut-off is taken first; a new shortfall is carried to the next
        // cut-off or paid by the employer (payroll.negative_net_handling).
        $carryIn = (float) Payroll::where('employee_id', $employee->id)
            ->whereDate('period_start', '<', $start->toDateString())
            ->orderByDesc('period_start')
            ->value('carry_over_out');
        $net -= $carryIn;
        $shortfall = $net < 0 ? -$net : 0.0;
        $net = max(0.0, $net);
        $carryOver = Settings::get('payroll.negative_net_handling') === 'CARRY_OVER';

        return [
            'pay_day' => $payDay,
            'pay_basis' => $monthly !== null ? 'monthly' : 'daily',
            'monthly_rate' => $monthly,
            'daily_rate' => Money::round($daily),
            'hourly_rate' => Money::round($hourly),
            'days_worked' => (int) round($sheet['days_present']),
            'days_present' => $sheet['days_present'],
            'absent_days' => $sheet['absent_days'],
            'late_minutes' => $sheet['late_minutes'],
            'paid_leave_days' => $sheet['paid_leave_days'],
            'unpaid_leave_days' => $sheet['unpaid_leave_days'],
            'unpaid_leave_hours' => $sheet['unpaid_leave_hours'],
            'holiday_hours' => $sheet['holiday_hours'],
            'ot_hours' => $sheet['ot_hours'],
            'basic_pay' => Money::round($basic),
            'paid_leave_pay' => Money::round($paidLeavePay),
            'holiday_pay' => Money::round($hp['holiday_pay']),
            'holiday_ot_pay' => Money::round($hp['holiday_ot_pay']),
            'overtime_pay' => Money::round($hp['overtime_pay']),
            'late_deduction' => Money::round($late),
            'absence_deduction' => Money::round($absence),
            'leave_deduction' => Money::round($leaveDeduction),
            'adjustments_total' => Money::round($adjTotal),
            'gross_pay' => Money::round($gross),
            'sss_deduction' => Money::round($gov['sss']),
            'philhealth_deduction' => Money::round($gov['philhealth']),
            'pagibig_deduction' => Money::round($gov['pagibig']),
            'tax_deduction' => Money::round($tax),
            'other_deductions' => 0,
            'taxable_income' => Money::round($taxable),
            'net_pay' => Money::round($net),
            'carry_over_in' => Money::round($carryIn),
            'carry_over_out' => $carryOver ? Money::round($shortfall) : 0,
            'employer_shouldered' => $carryOver ? 0 : Money::round($shortfall),
        ];
    }

    // Holiday pay, holiday overtime and ordinary overtime for a timesheet (R3,
    // rates from pay_multipliers on each day):
    //   worked holiday   paid hours x hourly x rate; for a monthly-rated
    //                    employee only the premium (rate - 1), since the
    //                    monthly basic already pays the day
    //   unworked holiday daily-rated: a work day x the "unworked" rate (client
    //                    default 0: no work, no pay); monthly-rated: nothing
    //                    is deducted unless payroll.monthly_unworked_holiday_deduct
    //   overtime         approved hours x hourly x the overtime rate of the day
    // Rest day and double holiday rates are their own keys (undecided; set to
    // the regular holiday rate).
    public static function holidayPay(array $sheet, float $hourly, float $daily, bool $monthly, float $hpd): array
    {
        $out = ['holiday_pay' => 0.0, 'holiday_ot_pay' => 0.0, 'overtime_pay' => 0.0, 'monthly_unworked_deduction' => 0.0];

        foreach ($sheet['holiday_worked'] as [$ymd, $h, $rest, $hours, $ot]) {
            $key = $h->is_double ? 'DOUBLE_HOLIDAY'
                : ($h->type === 'REGULAR' ? ($rest ? 'REGULAR_HOLIDAY_REST_DAY' : 'REGULAR_HOLIDAY_WORKED')
                : ($h->type === 'SPECIAL_WORKING' ? 'SPECIAL_WORKING_DAY_WORKED' : 'SPECIAL_HOLIDAY_WORKED'));
            $rate = PayMultiplier::rate($key, $ymd);
            $out['holiday_pay'] += $hours * $hourly * ($monthly ? max(0, $rate - 1) : $rate);
            $otKey = ($h->type === 'REGULAR' || $h->is_double) ? 'OT_REGULAR_HOLIDAY' : 'OT_SPECIAL_HOLIDAY';
            $out['holiday_ot_pay'] += $ot * $hourly * PayMultiplier::rate($otKey, $ymd);
        }

        foreach ($sheet['holiday_unworked'] as [$ymd, $h, $rest]) {
            if ($rest || $h->type === 'SPECIAL_WORKING') {
                continue;
            }
            $rate = PayMultiplier::rate($h->type === 'REGULAR' ? 'REGULAR_HOLIDAY_UNWORKED' : 'SPECIAL_HOLIDAY_UNWORKED', $ymd);
            if ($monthly) {
                if (Settings::get('payroll.monthly_unworked_holiday_deduct')) {
                    $out['monthly_unworked_deduction'] += $daily * max(0, 1 - $rate);
                }
            } else {
                $out['holiday_pay'] += $hpd * $hourly * $rate;
            }
        }

        // Ordinary overtime: rate of the period's last day is fine, the rate is per key.
        $out['overtime_pay'] = $sheet['ot_ordinary_hours'] * $hourly * PayMultiplier::rate('OT_ORDINARY', now(config('atice.timezone'))->toDateString());

        return $out;
    }

    // Recomputes a saved payroll (after an adjustment or a new timesheet approval).
    public static function refresh(Payroll $payroll): Payroll
    {
        $values = self::compute(
            $payroll->employee,
            ['start' => $payroll->period_start->toDateString(), 'end' => $payroll->period_end->toDateString(), 'pay_day' => $payroll->pay_day?->toDateString()],
            $payroll->adjustments()->get(['amount', 'taxable'])->toArray()
        );
        $payroll->update($values);

        return $payroll;
    }

    // Attendance and leave in the period, counted for pay.
    public static function timesheet(Employee $employee, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $hpd = (float) Settings::get('payroll.hours_per_day');
        $workDayNumbers = array_map('intval', explode(',', (string) Settings::get('attendance.work_days')));
        $hired = CarbonImmutable::parse($employee->date_hired);
        $today = CarbonImmutable::now(config('atice.timezone'))->startOfDay();

        $records = Attendance::whereDate('date', '>=', $start->toDateString())
            ->whereDate('date', '<=', $end->toDateString())
            ->whereNotNull('time_in')
            ->where(fn ($q) => $q->where('employee_id', $employee->id)
                ->orWhereHas('faceData', fn ($f) => $f->where('employee_id', $employee->id)))
            ->get(['date', 'time_out', 'hours_worked', 'late_minutes', 'ot_minutes', 'ot_approved'])
            ->groupBy(fn ($a) => $a->date->toDateString());

        $present = 0.0;
        foreach ($records as $day) {
            $hours = (float) $day->sum('hours_worked');
            $hasOut = $day->contains(fn ($a) => $a->time_out !== null);
            $present += ($hasOut && $hours > 0 && $hours < 4) ? 0.5 : 1;
        }
        $holidays = Holiday::byDate();
        $late = (int) $records->reject(fn ($day, $ymd) => isset($holidays[$ymd]))->flatten(1)->sum('late_minutes');

        // Holidays (R3). Worked: paid by the hour at the holiday rate, the paid
        // hours being the hours in, less the break on a day longer than a work
        // day (9 in = 8 paid). Overtime counts only once HR approved it.
        $break = (float) Settings::get('attendance.break_hours');
        $holidayWorked = [];   // [date, holiday, rest day?, paid hours, approved OT hours]
        $holidayUnworked = []; // [date, holiday, rest day?]
        $otPending = 0;
        $otOrdinaryHours = 0.0;
        foreach ($records as $ymd => $day) {
            $gross = (float) $day->sum('hours_worked');
            $otApproved = $day->where('ot_approved', true)->sum('ot_minutes') / 60;
            $otPending += (int) $day->where('ot_approved', false)->sum('ot_minutes');
            if (isset($holidays[$ymd])) {
                $paid = $gross > $hpd ? min($hpd, max(0, $gross - $break)) : $gross;
                $rest = ! in_array(CarbonImmutable::parse($ymd)->dayOfWeekIso, $workDayNumbers, true);
                $holidayWorked[] = [$ymd, $holidays[$ymd], $rest, $paid, $otApproved];
            } else {
                $otOrdinaryHours += $otApproved;
            }
        }
        foreach ($holidays as $ymd => $h) {
            $d = CarbonImmutable::parse($ymd);
            if ($ymd >= $start->toDateString() && $ymd <= $end->toDateString() && ! $records->has($ymd) && ! $d->lt($hired) && $d->lte($today)) {
                $holidayUnworked[] = [$ymd, $h, ! in_array($d->dayOfWeekIso, $workDayNumbers, true)];
            }
        }

        // Approved leave, day by day in the period
        $leaveDays = [];      // Y-m-d => true (covered by leave)
        $paidLeave = 0.0;
        $unpaidLeave = 0.0;
        $unpaidHours = 0.0;
        $leaves = LeaveRequest::where('employee_id', $employee->id)->where('status', 'approved')
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString())
            ->get();
        foreach ($leaves as $leave) {
            $total = max(0.0001, (float) $leave->total_days);
            $paidShare = min(1, (float) $leave->paid_days / $total);
            if ($leave->leave_type === 'emergency' && $leave->hours !== null) {
                // Hours on a day that was worked: only the unpaid hours matter.
                $unpaidHours += (float) $leave->unpaid_days * $hpd;
                $leaveDays[$leave->start_date->toDateString()] = true;

                continue;
            }
            $perDay = $leave->is_half_day ? 0.5 : 1;
            foreach (CarbonPeriod::create($leave->start_date->max($start), $leave->end_date->min($end)) as $d) {
                if (isset($holidays[$d->toDateString()])) {
                    continue; // a holiday inside a leave is not a leave day
                }
                $leaveDays[$d->toDateString()] = true;
                $paidLeave += $perDay * $paidShare;
                $unpaidLeave += $perDay * (1 - $paidShare);
            }
        }

        // Absent: a work day from the hire date up to today with no Time In and no leave
        $absent = 0;
        $workDaysSinceHire = 0;
        foreach (CarbonPeriod::create($start, $end) as $d) {
            if (! in_array($d->dayOfWeekIso, $workDayNumbers, true) || $d->lt($hired)) {
                continue;
            }
            $workDaysSinceHire++;
            $ymd = $d->toDateString();
            if ($d->lte($today) && ! $records->has($ymd) && ! isset($leaveDays[$ymd]) && ! isset($holidays[$ymd])) {
                $absent++;
            }
        }

        return [
            'days_present' => round($present, 2),
            'late_minutes' => $late,
            'absent_days' => (float) $absent,
            'paid_leave_days' => round($paidLeave, 2),
            'unpaid_leave_days' => round($unpaidLeave, 2),
            'unpaid_leave_hours' => round($unpaidHours, 2),
            'work_days_since_hire' => $workDaysSinceHire,
            'missing_time_out' => $records->filter(fn ($day) => ! $day->contains(fn ($a) => $a->time_out !== null))->count(),
            'holiday_worked' => $holidayWorked,
            'holiday_unworked' => $holidayUnworked,
            'holiday_days_present' => count($holidayWorked),
            'holiday_hours' => round(array_sum(array_column($holidayWorked, 3)), 2),
            'ot_hours' => round($otOrdinaryHours + array_sum(array_column($holidayWorked, 4)), 2),
            'ot_ordinary_hours' => $otOrdinaryHours,
            'ot_pending_minutes' => $otPending,
        ];
    }

    // Employee shares for this pay day: the monthly amounts times the share the
    // deduction strategy gives this pay day (1, 0.5 or 0).
    public static function government(float $monthlyBasis, string $payDay): array
    {
        $share = self::governmentShare($payDay);
        $sss = ContributionRate::rulesOn('sss', $payDay);
        $ph = ContributionRate::rulesOn('philhealth', $payDay);
        $hdmf = ContributionRate::rulesOn('pagibig', $payDay);

        $msc = $sss ? min($sss['msc_max'], max($sss['msc_min'], round($monthlyBasis / $sss['msc_step']) * $sss['msc_step'])) : 0;

        return [
            'share' => $share,
            'sss' => $sss ? $sss['employee_rate'] * $msc * $share : 0.0,
            'philhealth' => $ph ? $ph['employee_rate'] * min($ph['basis_max'], max($ph['basis_min'], $monthlyBasis)) * $share : 0.0,
            'pagibig' => $hdmf ? min($hdmf['max'], $hdmf['employee_rate'] * $monthlyBasis) * $share : 0.0,
        ];
    }

    public static function governmentShare(string $payDay): float
    {
        $n = PayPeriod::payDayNumber($payDay);

        return match ((string) Settings::get('payroll.gov_deduction_strategy')) {
            'FIRST_PAYROLL_OF_MONTH' => $n === 1 ? 1.0 : 0.0,
            default => in_array($n, [1, 2], true) ? 0.5 : 0.0, // SPLIT_FIRST_TWO
        };
    }

    // Withholding tax for one period (TRAIN, annualized).
    public static function withholdingTax(float $taxablePerPeriod, string $payDay): float
    {
        $rules = ContributionRate::rulesOn('tax', $payDay);
        if (! $rules || $taxablePerPeriod <= 0) {
            return 0.0;
        }
        $annual = $taxablePerPeriod * self::PERIODS_PER_YEAR;
        $bracket = null;
        foreach ($rules['annual_brackets'] as $b) {
            if ($annual > $b['over']) {
                $bracket = $b;
            }
        }
        $annualTax = $bracket ? $bracket['base'] + $bracket['rate'] * ($annual - $bracket['over']) : 0.0;

        return $annualTax / self::PERIODS_PER_YEAR;
    }
}
