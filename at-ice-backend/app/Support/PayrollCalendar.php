<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\LiveEvent;
use App\Models\Payroll;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

// Employees are paid bi-weekly: every 14 days, Monday to the Sunday of the
// next week, counted from the payroll.anchor setting (a Monday; default
// 2026-01-05, or PAYROLL_ANCHOR in .env).
// HR picks one of these periods in the payroll form (GET payroll-periods),
// and on each cut-off day HR and Admin get one live notice to prepare the
// payroll (notifyCutoff, run by the live-feed poll since there is no scheduler).
class PayrollCalendar
{
    public const DAYS = 14;

    private const TZ = 'Asia/Manila';

    // The pay period a date falls in: ['start', 'end', 'pay_day'] (Y-m-d).
    // The rule itself is AppSupportPayPeriod (anchor and length in Settings).
    public static function periodFor(Carbon|string $date): array
    {
        $d = $date instanceof Carbon ? $date->copy()->setTimezone(self::TZ)->toDateString() : substr((string) $date, 0, 10);

        return PayPeriod::for($d);
    }

    // The current period and the ones before it, newest first.
    public static function recent(int $count = 6): array
    {
        $today = Carbon::now(self::TZ);
        $list = [];
        for ($i = 0; $i < $count; $i++) {
            $p = self::periodFor($today->copy()->subDays($i * self::DAYS));
            $p['label'] = Carbon::parse($p['start'])->format('M j').' – '.Carbon::parse($p['end'])->format('M j, Y');
            $p['current'] = $i === 0;
            $list[] = $p;
        }

        return $list;
    }

    // Active employees with no payroll yet for a period.
    public static function missing(array $period)
    {
        $paid = Payroll::whereDate('period_start', '<=', $period['end'])
            ->whereDate('period_end', '>=', $period['start'])
            ->pluck('employee_id');

        return Employee::where('is_active', true)
            ->whereDate('date_hired', '<=', $period['end'])
            ->whereNotIn('id', $paid)
            ->get();
    }

    // On the cut-off day (the period's last day) and after, one live notice per
    // period to HR (Admin sees every notice) to prepare that period's payroll.
    public static function notifyCutoff(): void
    {
        try {
            $today = Carbon::now(self::TZ)->toDateString();
            $current = self::periodFor($today);
            // The period that ends today, or else the one that just ended.
            $due = $current['end'] === $today ? $current : self::periodFor(Carbon::parse($current['start'])->subDay());

            if (! Cache::add("payroll-cutoff:{$due['end']}", true, now()->addDays(30))) {
                return;
            }

            $missing = self::missing($due)->count();
            $label = Carbon::parse($due['start'])->format('M j').' – '.Carbon::parse($due['end'])->format('M j');
            $pay = Carbon::parse($due['pay_day'])->format('D, M j');
            LiveEvent::create([
                'module' => 'payroll',
                'action' => 'cutoff',
                'message' => $missing > 0
                    ? "Payroll cut-off {$label}: prepare the payroll of {$missing} employee".($missing === 1 ? '' : 's')." (pay day {$pay})"
                    : "Payroll cut-off {$label}: every employee's payroll is done (pay day {$pay})",
                'roles' => ['hr'],
                'user_ids' => [],
                'actor_id' => null,
            ]);
        } catch (Throwable $e) {
            Log::warning('Payroll cut-off notice: '.$e->getMessage());
        }
    }
}
