<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

// Rates and rules that Admin can change instead of being hardcoded
// (docs/REVIEW-DECISIONS.md). DEFAULTS is the full list with the agreed
// values; a row in the settings table overrides one. Every change is written
// to the audit log.
class Settings
{
    private const CACHE_KEY = 'app-settings';

    // key => [default, type, description]
    public const DEFAULTS = [
        // Pay period (App\Support\PayPeriod)
        'payroll.anchor' => ['2026-01-05', 'date', 'First day of a pay period (a Monday); every period is counted from it'],
        'payroll.cutoff_days' => [14, 'int', 'Days in a pay period (bi-weekly)'],
        'payroll.payday_offset_days' => [5, 'int', 'Days after the cut-off that pay is released (5 = the Friday after)'],
        // Rates (App\Support\Rates)
        'payroll.hours_per_day' => [8, 'number', 'Paid hours in a work day'],
        // Reviewer's example: 16,000 a month = 732.94 a day = 91.62 an hour.
        // (12 x 261 days would be 21.75; owner to confirm which one.)
        'payroll.monthly_to_daily_divisor' => [21.83, 'number', 'Monthly rate divided by this gives the daily rate'],
        // R3, undecided: the 21.83 (261-day) divisor assumes paid regular holidays
        'payroll.monthly_unworked_holiday_deduct' => [false, 'bool', 'Deduct an unworked holiday from monthly-rated pay'],
        'payroll.negative_net_handling' => ['CARRY_OVER', 'enum:CARRY_OVER,EMPLOYER_SHOULDERED', 'When deductions are more than the pay: carry the shortfall to the next cut-off, or the employer pays it'],
        'payroll.gov_deduction_strategy' => ['SPLIT_FIRST_TWO', 'enum:FIRST_PAYROLL_OF_MONTH,SPLIT_FIRST_TWO', 'When SSS, PhilHealth and Pag-IBIG are deducted'],
        // Attendance
        'attendance.shift_start' => ['09:00', 'time', 'Default shift start (HH:MM)'],
        'attendance.shift_end' => ['18:00', 'time', 'Default shift end (HH:MM)'],
        'attendance.night_shift_start' => ['21:00', 'time', 'Night shift start used when the old "Night" label was turned into hours'],
        'attendance.night_shift_end' => ['06:00', 'time', 'Night shift end (the next day) used for the old "Night" label'],
        'attendance.break_hours' => [1, 'number', 'Unpaid break taken off a day longer than the paid hours (e.g. 9 hours in = 8 paid)'],
        'attendance.grace_minutes' => [0, 'int', 'Minutes after shift start that are not counted as late'],
        'attendance.work_days' => ['1,2,3,4,5', 'days', 'Work days, 1 = Monday to 7 = Sunday (absences are counted on these)'],
        // Kiosk
        'kiosk.hr_can_override' => [false, 'bool', 'HR may unlock a locked kiosk from the Kiosk PIN page (otherwise Admin only)'],
        'kiosk.max_wrong_pins' => [5, 'int', 'Wrong PINs in a row that lock a kiosk until Admin unlocks it'],
        'kiosk.max_wrong_pins_per_ip' => [10, 'int', 'Wrong PINs from one network address in an hour (any kiosk) before that address is blocked for the hour'],
        // Leave
        'leave.credits_per_cutoff' => [0.5, 'number', 'Leave credits (days) earned each pay period once regular'],
        'leave.credits_cap' => [15, 'number', 'Most leave credits an employee can hold'],
        'leave.sl_filing_window_days' => [1, 'int', 'Days after returning that sick leave can still be filed'],
        'leave.vl_notice_days' => [14, 'int', 'Days ahead that vacation leave must be filed'],
        // Deliveries (App\Support\DeliveryDispatch)
        'delivery.delay_notice_hours' => [2, 'int', 'Hours before a reassigned or queued delivery that the store is told it may be late'],
        'delivery.arrival_radius_m' => [150, 'int', 'How close (meters) the Driver and the Salesman must be to the store pin to press Arrived; a delivery is confirmed only after both have arrived'],
        'plant.latitude' => [14.8031, 'number', 'Plant location (latitude): each route lists the stores nearest to the plant first'],
        'plant.longitude' => [121.0515, 'number', 'Plant location (longitude)'],
        'delivery.not_timed_in_minutes' => [60, 'int', 'Minutes after their shift starts that a Driver with no Time In counts as absent and their pending deliveries today are reassigned'],
        'delivery.max_top_ups_per_day' => [3, 'int', 'Most urgent top-ups one store can get after one delivery in a day'],
        // Support tickets (SupportMessageController)
        'support.overdue_hours' => [24, 'int', 'Hours an open support ticket may wait before it is marked Overdue'],
        'support.max_open_tickets' => [5, 'int', 'Most open or in-progress tickets a customer may have at once (Emergency Ice Shortage is never blocked)'],
        // Disciplinary memos (App\Support\MemoEngine, EmployeeMemoController)
        'memo.no_timeout_grace_hours' => [2, 'int', 'Hours after the shift ends before a missing Time Out becomes a draft memo for HR to review'],
        'memo.strike_window_months' => [12, 'int', 'Months an offense counts toward the next warning level (1st verbal, 2nd first written, 3rd final written, 4th Notice to Explain)'],
        'memo.lookback_days' => [7, 'int', 'How many days back the system looks for missing Time Outs (older ones are left alone)'],
        // Performance (App\Support\PerformanceScore): weights of the Draft Base Rating and each role's goal per pay period
        'performance.weight_attendance' => [50, 'int', 'Weight of attendance (days with a Time In / work days) in the draft performance rating'],
        'performance.weight_punctuality' => [30, 'int', 'Weight of punctuality (days on time / days with a Time In) in the draft performance rating'],
        'performance.weight_goal' => [20, 'int', 'Weight of the goal (work done / goal) in the draft performance rating'],
        'performance.goal_driver' => [50, 'int', 'Driver goal per pay period: deliveries delivered'],
        'performance.goal_salesman' => [50, 'int', 'Salesman goal per pay period: deliveries confirmed with proof'],
        'performance.goal_checker' => [60, 'int', 'Checker goal per pay period: ice loading counts and stock movements'],
        'performance.goal_maintenance' => [8, 'int', 'Maintenance goal per pay period: parts requests and projects filed'],
        // 13th month
        'thirteenth.credit_date' => ['12-01', 'month-day', 'Date the 13th month pay is credited (MM-DD; legal deadline 12-24)'],
        // Retention (nothing is deleted on its own; Admin reviews)
        'archive.expiry_action' => ['REVIEW', 'enum:REVIEW,ANONYMIZE,PURGE', 'What happens each day to inactive employees past the retention period: Admin reviews them, or they are anonymized or deleted'],
        'retention.years' => [2, 'int', 'Years inactive employees and old timesheets are kept before Admin reviews them'],
    ];

    public static function get(string $key): mixed
    {
        if (! array_key_exists($key, self::DEFAULTS)) {
            throw new InvalidArgumentException("Unknown setting {$key}");
        }
        $stored = self::stored();
        if (array_key_exists($key, $stored)) {
            return $stored[$key];
        }

        // The anchor could already be set with PAYROLL_ANCHOR in .env.
        return $key === 'payroll.anchor'
            ? config('services.payroll.anchor', self::DEFAULTS[$key][0])
            : self::DEFAULTS[$key][0];
    }

    // Every setting with its value, default, type and description (Admin page).
    public static function all(): array
    {
        $stored = self::stored();
        $out = [];
        foreach (self::DEFAULTS as $key => [$default, $type, $label]) {
            $out[] = [
                'key' => $key,
                'value' => array_key_exists($key, $stored) ? $stored[$key] : $default,
                'default' => $default,
                'type' => $type,
                'label' => $label,
            ];
        }

        return $out;
    }

    public static function set(string $key, mixed $value, ?int $userId = null): void
    {
        $before = self::get($key);
        DB::table('settings')->updateOrInsert(
            ['key' => $key],
            ['value' => json_encode($value), 'updated_by' => $userId, 'updated_at' => now(), 'created_at' => now()]
        );
        Cache::forget(self::CACHE_KEY);
        Audit::log('setting.changed', null, ['key' => $key, 'value' => $before], ['key' => $key, 'value' => $value]);
    }

    // A value checked against the setting's type, or an error message.
    public static function validate(string $key, mixed $value): ?string
    {
        $type = self::DEFAULTS[$key][1] ?? null;

        return match (true) {
            $type === null => 'Unknown setting.',
            $type === 'int' => is_int($value) || (is_string($value) && ctype_digit($value)) ? null : 'Enter a whole number.',
            $type === 'number' => is_numeric($value) && $value >= 0 ? null : 'Enter a number (0 or more).',
            $type === 'date' => is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) && strtotime($value) ? null : 'Enter a date (YYYY-MM-DD).',
            $type === 'time' => is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) ? null : 'Enter a time (HH:MM, 24-hour).',
            $type === 'bool' => in_array($value, [true, false, 0, 1, '0', '1', 'true', 'false'], true) ? null : 'Choose yes or no.',
            $type === 'days' => is_string($value) && preg_match('/^[1-7](,[1-7])*$/', $value) ? null : 'Enter day numbers separated by commas, e.g. 1,2,3,4,5.',
            $type === 'month-day' => is_string($value) && preg_match('/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $value) ? null : 'Enter a date as MM-DD.',
            str_starts_with($type, 'enum:') => in_array($value, explode(',', substr($type, 5)), true) ? null : 'Choose one of: '.substr($type, 5),
            default => null,
        };
    }

    // The value in the type the setting uses ("8" -> 8).
    public static function cast(string $key, mixed $value): mixed
    {
        return match (self::DEFAULTS[$key][1] ?? null) {
            'int' => (int) $value,
            'number' => $value + 0,
            'bool' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default => $value,
        };
    }

    private static function stored(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => DB::table('settings')->pluck('value', 'key')
            ->map(fn ($v) => json_decode($v, true))
            ->all());
    }
}
