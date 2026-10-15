<?php

namespace App\Support;

use App\Models\Employee;

// Late minutes at Time In, counted in whole minutes from the shift start:
// late_minutes = floor((time_in - shift_start) / 60 seconds), so with a 09:00
// shift 09:00:59 is 0 minutes late and 09:01:00 is 1. Within the grace period
// (attendance.grace_minutes, default 0) it is not late at all. Automatic: the
// time comes from the server clock at the kiosk. Overnight shifts work: with a
// 22:00 start, a 00:30 Time In is 150 minutes late and 21:50 is on time.
class Lateness
{
    public static function minutes(string $shiftStart, string $timeIn, ?int $grace = null): int
    {
        $grace ??= (int) Settings::get('attendance.grace_minutes');
        $diff = self::seconds($timeIn) - self::seconds($shiftStart);
        // Across midnight: more than 12 hours apart means the other side of it.
        if ($diff < -43200) {
            $diff += 86400;
        } elseif ($diff > 43200) {
            $diff -= 86400;
        }
        $late = intdiv($diff, 60);
        if ($late <= 0 || $late <= $grace) {
            return 0;
        }

        return $late;
    }

    // The shift start for an employee: their own time range (R3), or the
    // default of their old Day/Night label if it was never set.
    public static function shiftStart(?Employee $employee): ?string
    {
        if ($employee?->shift_start) {
            return substr($employee->shift_start, 0, 5);
        }

        return (string) Settings::get($employee?->shift === 'night' ? 'attendance.night_shift_start' : 'attendance.shift_start');
    }

    // "day" or "night" for a time range: night when it ends the next day.
    public static function label(string $start, string $end): string
    {
        return self::seconds($end) <= self::seconds($start) ? 'night' : 'day';
    }

    private static function seconds(string $time): int
    {
        [$h, $m, $s] = array_map('intval', array_pad(explode(':', $time), 3, 0));

        return $h * 3600 + $m * 60 + $s;
    }
}
