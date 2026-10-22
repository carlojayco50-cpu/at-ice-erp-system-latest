<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeMemo;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

// Missed Time Out -> draft memo. There is no scheduler: the live-feed poll of
// HR or Admin calls run() (at most every 10 minutes). An attendance with a
// Time In and no Time Out whose shift ended memo.no_timeout_grace_hours ago
// gets one draft memo whose level follows the offense number (1st verbal, 2nd
// first written, 3rd final written, 4th and later Notice to Explain). HR
// reviews and sends every draft; nothing reaches the employee on its own.
class MemoEngine
{
    public static function run(bool $force = false): int
    {
        try {
            if (! $force && ! Cache::add('memo-engine:tick', true, now()->addMinutes(10))) {
                return 0;
            }

            return self::draftMissedTimeOuts(now());
        } catch (Throwable $e) {
            Log::warning('MemoEngine: '.$e->getMessage());

            return 0;
        }
    }

    public static function draftMissedTimeOuts(Carbon $now): int
    {
        $grace = (int) Settings::get('memo.no_timeout_grace_hours');
        $since = $now->copy()->subDays((int) Settings::get('memo.lookback_days'))->toDateString();

        $rows = Attendance::query()
            ->whereNotNull('time_in')
            ->whereNull('time_out')
            ->whereDate('date', '>=', $since)
            ->whereDate('date', '<', $now->copy()->addDay()->toDateString())
            ->whereNotIn('id', EmployeeMemo::whereNotNull('attendance_id')->select('attendance_id'))
            ->with('employee')
            ->orderBy('date')
            ->get();

        $made = 0;
        foreach ($rows as $att) {
            $employee = $att->employee;
            if (! $employee || $employee->deactivated_at) {
                continue;
            }
            if ($now->lt(self::shiftEnd($att, $employee)->addHours($grace))) {
                continue; // still on shift, or within the grace period
            }

            DB::transaction(function () use ($att, $employee, &$made) {
                $offense = EmployeeMemo::nextOffenseNo($employee->id, 'no_time_out');
                $level = EmployeeMemo::levelForOffense($offense);
                $incident = Carbon::parse($att->date->toDateString());

                EmployeeMemo::create([
                    'memo_no' => EmployeeMemo::nextMemoNo(),
                    'employee_id' => $employee->id,
                    'violation' => 'no_time_out',
                    'category' => 'attendance',
                    'level' => $level,
                    'offense_no' => $offense,
                    'status' => 'draft',
                    'source' => 'auto',
                    'subject' => EmployeeMemo::subjectFor('no_time_out', $level),
                    'body' => EmployeeMemo::draftBody($employee, 'no_time_out', $level, $incident, $offense),
                    'incident_date' => $incident->toDateString(),
                    'attendance_id' => $att->id,
                ]);
                $employee->increment('no_timeout_count');
                $made++;
            });
        }

        return $made;
    }

    // When the shift on that attendance ended (overnight shifts end the next day).
    public static function shiftEnd(Attendance $att, Employee $employee): Carbon
    {
        $day = $att->date->toDateString();
        $start = $employee->shift_start ?: '08:00:00';
        $end = $employee->shift_end ?: '17:00:00';
        $endAt = Carbon::parse("{$day} {$end}");

        return substr($end, 0, 5) <= substr($start, 0, 5) ? $endAt->addDay() : $endAt;
    }
}
