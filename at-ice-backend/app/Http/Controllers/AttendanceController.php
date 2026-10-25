<?php

namespace App\Http\Controllers;

use App\Events\AttendanceRecorded;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Support\Lateness;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    // An open Time In older than this is treated as a missed Time Out and
    // is no longer matched by a new scan.
    private const MAX_SHIFT_HOURS = 16;

    // GET /api/attendances?date= | ?from=&to= [&employee_id=] : newest first.
    public function index(Request $request)
    {
        // Each record says if its date is a holiday (shown as a Holiday badge).
        return response()->json($this->query($request)->get()->each(function ($a) {
            $h = Holiday::forDate($a->date->toDateString());
            $a->setAttribute('holiday', $h ? ['name' => $h->name, 'type' => $h->type] : null);
        }));
    }

    // "09:03:10" -> "9:03:10 AM" for the CSV people read (seconds kept: late is counted from them)
    private static function clock(?string $t): string
    {
        return $t ? Carbon::parse($t)->format('g:i:s A') : '';
    }

    // GET /api/attendances/export?from=&to=[&employee_id=] : CSV of the history
    // (for documentation and coaching, e.g. absences in a row). The PDF is the
    // same list printed from the page.
    public function export(Request $request)
    {
        $request->validate(['from' => 'required|date', 'to' => 'required|date|after_or_equal:from']);
        $rows = $this->query($request)->get();
        $name = 'attendance-'.$request->from.'-to-'.$request->to.'.csv';

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Employee ID', 'Name', 'Position', 'Date', 'Time In', 'Time Out', 'Hours', 'Late (min)', 'Status', 'Notes']);
            foreach ($rows as $a) {
                fputcsv($out, [
                    $a->employee?->employee_id ?? '',
                    $a->employee?->full_name ?? $a->faceData?->worker_name ?? '',
                    $a->employee?->position ?? $a->faceData?->role ?? '',
                    $a->date?->toDateString(),
                    self::clock($a->time_in),
                    self::clock($a->time_out),
                    $a->hours_worked,
                    $a->late_minutes,
                    $a->status,
                    $a->notes,
                ]);
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function query(Request $request)
    {
        $request->validate([
            'date' => 'nullable|date',
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
            'employee_id' => 'nullable|integer',
        ]);

        return Attendance::with([
            'employee',
            'recordedBy',
            'faceData:id,worker_name,role,employee_id',
        ])
            ->when($request->filled('date'), fn ($q) => $q->whereDate('date', $request->date))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('date', '>=', $request->from))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('date', '<=', $request->to))
            ->when($request->filled('employee_id'), function ($q) use ($request) {
                $id = (int) $request->employee_id;
                $q->where(fn ($w) => $w->where('employee_id', $id)->orWhereHas('faceData', fn ($f) => $f->where('employee_id', $id)));
            })
            ->orderBy('date', 'desc')
            ->orderBy('time_in', 'desc');
    }

    // GET /api/attendances/summary?employee_id=&from=&to=
    // Days worked in a payroll period, counted from attendance: a day with a
    // Time In counts as 1, or 0.5 when its Time Out shows under 4 hours worked.
    // Used to fill Days Worked when HR adds a payroll entry.
    public function summary(Request $request)
    {
        $request->validate([
            'employee_id' => 'required|integer|exists:employees,id',
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);

        $employeeId = (int) $request->employee_id;
        $rows = Attendance::whereDate('date', '>=', $request->from)
            ->whereDate('date', '<=', $request->to)
            ->whereNotNull('time_in')
            ->where(function ($q) use ($employeeId) {
                $q->where('employee_id', $employeeId)
                    ->orWhereHas('faceData', fn ($f) => $f->where('employee_id', $employeeId));
            })
            ->get(['date', 'time_in', 'time_out', 'hours_worked'])
            ->groupBy(fn ($a) => $a->date->toDateString());

        $days = 0.0;
        $missingTimeOut = 0;
        foreach ($rows as $dayRows) {
            $hours = (float) $dayRows->sum('hours_worked');
            $hasOut = $dayRows->contains(fn ($a) => $a->time_out !== null);
            if (! $hasOut) {
                $missingTimeOut++;
            }
            $days += ($hasOut && $hours > 0 && $hours < 4) ? 0.5 : 1;
        }

        return response()->json([
            'days_worked' => $days,
            'days_present' => $rows->count(),
            'missing_time_out' => $missingTimeOut,
            'hours_worked' => round((float) $rows->flatten(1)->sum('hours_worked'), 2),
        ]);
    }

    // The kiosk may say how long ago the worker blinked (elapsed_ms): the face
    // checks and the network take a moment, and that must never make anyone
    // late (owner, 2026-10-22). At most this much is taken off the server time.
    private const MAX_ELAPSED_MS = 5000;

    // POST /api/attendances (public, used by the Attendance Station kiosk)
    // The kiosk now sends which button was selected: "time_in" or
    // "time_out". Date and time always come from the server clock
    // (config('atice.timezone')), never from the browser: the kiosk only sends how many
    // milliseconds ago the blink finished (a stopwatch, not its clock), and
    // the recorded time is the server time minus that, capped.
    public function store(Request $request)
    {
        $request->validate([
            'face_data_id' => 'required|exists:face_data,id',
            'type' => 'required|in:time_in,time_out',
            'elapsed_ms' => 'nullable|integer|min:0|max:600000',
        ]);

        $faceData = FaceData::select('id', 'worker_name', 'role', 'employee_id')
            ->findOrFail($request->face_data_id);

        // A deactivated employee can no longer record attendance.
        if ($faceData->employee_id && ! Employee::whereKey($faceData->employee_id)->where('is_active', true)->exists()) {
            return $this->reject($faceData, 'inactive',
                'This employee is no longer active. Please inform HR.');
        }

        // the moment of the blink (server clock minus the kiosk's short delay)
        $now = now(config('atice.timezone'))->subMilliseconds(min((int) $request->input('elapsed_ms', 0), self::MAX_ELAPSED_MS));
        $today = $now->toDateString();

        // A new hire whose start date has not come yet cannot time in.
        if ($faceData->employee_id && Employee::whereKey($faceData->employee_id)->whereDate('date_hired', '>', $today)->exists()) {
            $starts = Employee::whereKey($faceData->employee_id)->value('date_hired');

            return $this->reject($faceData, 'not_started',
                'Your start date is '.Carbon::parse($starts)->format('M j, Y').'. Time In opens on that day.');
        }

        // Open record: today's, or yesterday's for a night shift
        $open = Attendance::where('face_data_id', $faceData->id)
            ->whereNull('time_out')
            ->whereDate('date', '>=', $now->copy()->subDay()->toDateString())
            ->orderByDesc('date')
            ->first();

        $openIn = null;
        if ($open) {
            $openIn = Carbon::parse(
                Carbon::parse($open->date)->toDateString().' '.$open->time_in, config('atice.timezone')
            );
            // Too long ago: treat as a missed Time Out, not an open shift
            if ($openIn->diffInHours($now, true) > self::MAX_SHIFT_HOURS) {
                $open = null;
                $openIn = null;
            }
        }

        // Worker already has a complete Time In and Time Out today
        $doneToday = Attendance::where('face_data_id', $faceData->id)
            ->whereDate('date', $today)
            ->whereNotNull('time_out')
            ->exists();

        // TIME OUT
        if ($request->type === 'time_out') {
            if (! $open) {
                if ($doneToday) {
                    return $this->reject($faceData, 'completed',
                        'Time In and Time Out are already recorded for today.');
                }

                return $this->reject($faceData, 'no_time_in',
                    'No Time In found. Select Time In first, or inform HR.');
            }

            $minutes = $openIn->diffInMinutes($now, true);
            $hours = round($minutes / 60, 2);

            // Overtime: whole minutes past the shift end (overnight shifts end
            // the next day). Paid only after HR approves it on the timesheet.
            $ot = 0;
            $emp = $faceData->employee_id ? Employee::find($faceData->employee_id) : null;
            if ($emp?->shift_end) {
                $shiftEnd = Carbon::parse($openIn->toDateString().' '.$emp->shift_end, config('atice.timezone'));
                if (Lateness::label((string) $emp->shift_start, (string) $emp->shift_end) === 'night') {
                    $shiftEnd->addDay();
                }
                $ot = max(0, (int) floor($shiftEnd->diffInSeconds($now, false) / 60));
            }

            $open->update([
                'time_out' => $now->format('H:i:s'),
                'hours_worked' => $hours,
                'ot_minutes' => $ot,
            ]);

            $this->notify($faceData, $open, 'time_out',
                "{$faceData->worker_name} timed out at {$now->format('g:i A')} ({$hours} hrs).");

            return response()->json([
                'type' => 'time_out',
                'message' => 'Time Out recorded.',
                'worker' => $faceData->worker_name,
                'role' => $faceData->role,
                'hours_worked' => $hours,
                'attendance' => $open,
            ], 200);
        }

        // TIME IN
        if ($open) {
            return $this->reject($faceData, 'already_timed_in',
                'Time In already recorded. Select Time Out at the end of your shift.');
        }

        if ($doneToday) {
            return $this->reject($faceData, 'completed',
                'Time In and Time Out are already recorded for today.');
        }

        // Late minutes from the shift start (whole minutes; 9:00:59 is on time).
        $timeIn = $now->format('H:i:s');
        $shiftStart = Lateness::shiftStart($faceData->employee_id ? Employee::find($faceData->employee_id) : null);
        // On a holiday no one is late (R3).
        $late = $shiftStart && ! Holiday::forDate($today) ? Lateness::minutes($shiftStart, $timeIn) : 0;

        $attendance = Attendance::create([
            'face_data_id' => $faceData->id,
            'employee_id' => $faceData->employee_id,
            'recorded_by' => null,
            'date' => $today,
            'time_in' => $timeIn,
            'time_out' => null,
            'hours_worked' => 0,
            'late_minutes' => $late,
            'status' => $late > 0 ? 'late' : 'present',
            'notes' => null,
        ]);

        $this->notify($faceData, $attendance, 'time_in',
            "{$faceData->worker_name} timed in at {$now->format('g:i A')}.");

        return response()->json([
            'type' => 'time_in',
            'message' => 'Time In recorded.',
            'worker' => $faceData->worker_name,
            'role' => $faceData->role,
            'attendance' => $attendance,
        ], 201);
    }

    // A scan that is understood but not recorded (wrong button, already done)
    private function reject(FaceData $faceData, string $type, string $message)
    {
        return response()->json([
            'type' => $type,
            'message' => $message,
            'worker' => $faceData->worker_name,
            'role' => $faceData->role,
        ], 409);
    }

    // Live notification for HR and the Admin dashboard (Pusher)
    private function notify(FaceData $faceData, Attendance $attendance, string $type, string $message): void
    {
        try {
            broadcast(new AttendanceRecorded([
                'face_data_id' => $attendance->face_data_id,
                'employee_id' => $attendance->employee_id,
                'worker' => $faceData->worker_name,
                'type' => $type,
                'date' => $attendance->date,
                'time_in' => $attendance->time_in,
                'time_out' => $attendance->time_out,
                'status' => $attendance->status,
                'message' => $message,
            ]))->toOthers();
        } catch (\Throwable $e) {
            // The attendance is already saved; a broadcast failure must not
            // turn a successful scan into an error at the kiosk.
            report($e);
        }
    }

    // PUT update attendance: a note only. Times, hours, late minutes and status
    // come only from the kiosk scans (no manual timekeeping edits).
    public function update(Request $request, $id)
    {
        $attendance = Attendance::findOrFail($id);

        if ($request->hasAny(['time_in', 'time_out', 'status', 'hours_worked', 'late_minutes', 'date'])) {
            return response()->json([
                'message' => 'Attendance times and status come only from the Attendance Station and cannot be edited. Add a note instead.',
            ], 422);
        }

        $data = $request->validate([
            'notes' => 'required|nullable|string|max:500',
        ]);

        $attendance->update($data);

        return response()->json([
            'message' => 'Attendance updated successfully!',
            'attendance' => $attendance,
        ]);
    }

    // GET /api/attendances/roster?date=YYYY-MM-DD (default today)
    // Who has not timed in on that date and who is on approved leave, so HR
    // sees the whole staff on the Daily view, not only those who scanned in.
    public function roster(Request $request)
    {
        $request->validate(['date' => 'nullable|date']);
        $date = $request->filled('date') ? Carbon::parse($request->date)->toDateString() : now(config('atice.timezone'))->toDateString();

        // Active and already started (a future hire is not "not in yet")
        $employees = Employee::where('is_active', true)->whereDate('date_hired', '<=', $date)->get();

        $leaves = LeaveRequest::where('status', 'approved')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->get()
            ->keyBy('employee_id');

        $attendances = Attendance::with('faceData:id,employee_id')->whereDate('date', $date)->get();
        $timedIn = $attendances->map(fn ($a) => $a->employee_id ?: $a->faceData?->employee_id)->filter()->unique()->flip();

        $row = fn ($e) => [
            'id' => $e->id,
            'employee_id' => $e->employee_id,
            'name' => $e->full_name,
            'position' => $e->position,
        ];

        $onLeave = $employees->filter(fn ($e) => $leaves->has($e->id))
            ->map(fn ($e) => $row($e) + [
                'leave_type' => $leaves[$e->id]->leave_type,
                'is_half_day' => (bool) $leaves[$e->id]->is_half_day,
                'start_date' => $leaves[$e->id]->start_date,
                'end_date' => $leaves[$e->id]->end_date,
                'timed_in' => $timedIn->has($e->id),
            ])->values();

        // On a holiday no one is absent or "not in yet" (R3).
        $holiday = Holiday::forDate($date);
        $notIn = $holiday ? collect() : $employees->filter(fn ($e) => ! $timedIn->has($e->id) && ! $leaves->has($e->id))
            ->map($row)->values();

        return response()->json([
            'date' => $date,
            'holiday' => $holiday ? ['name' => $holiday->name, 'type' => $holiday->type] : null,
            'total_employees' => $employees->count(),
            'not_in' => $notIn->sortBy('name')->values(),
            'on_leave' => $onLeave->sortBy('name')->values(),
        ]);
    }

    // GET attendance by employee
    public function getByEmployee($employee_id)
    {
        $attendances = Attendance::with('recordedBy')
            ->where('employee_id', $employee_id)
            ->orderBy('date', 'desc')
            ->get();

        return response()->json($attendances);
    }
}
