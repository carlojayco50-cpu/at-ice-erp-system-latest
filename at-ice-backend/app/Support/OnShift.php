<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Whether a user is on shift now: their employee record has a Time In from the
 * kiosk and no Time Out yet. Today's record, or yesterday's for a night shift
 * still within 16 hours (same limit as the kiosk's open shift).
 */
class OnShift
{
    private const MAX_SHIFT_HOURS = 16;

    public static function isTimedIn(User $user): bool
    {
        $employeeId = $user->employee?->id;
        if (! $employeeId) {
            return false;
        }

        $now = now();
        $open = Attendance::where('employee_id', $employeeId)
            ->whereNotNull('time_in')
            ->whereNull('time_out')
            ->whereDate('date', '>=', $now->copy()->subDay()->toDateString())
            ->orderByDesc('date')
            ->first();

        if (! $open) {
            return false;
        }

        $in = Carbon::parse(Carbon::parse($open->date)->toDateString().' '.$open->time_in);

        return $in->diffInHours($now, true) <= self::MAX_SHIFT_HOURS;
    }
}
