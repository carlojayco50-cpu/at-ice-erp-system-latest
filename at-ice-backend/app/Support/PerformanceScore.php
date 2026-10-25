<?php

namespace App\Support;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\IceLoading;
use App\Models\LeaveRequest;
use App\Models\PerformanceReview;
use App\Models\Project;
use App\Models\StockMovement;
use App\Models\StockOutRequest;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;

// Semi-automated performance pipeline (owner, 2026-10-20). For every active
// employee and pay period the records give a Draft Base Rating:
//   attendance   days with a Time In / work days (work days in Settings,
//                holidays and approved leave left out, from the hire date
//                up to today)
//   punctuality  days on time / days with a Time In
//   goal         the role's work done in the period / its goal
//                (Driver deliveries, Salesman confirmations, Checker counts
//                and stock movements, Maintenance requests and projects);
//                the goal is Settings performance.goal_<role>, or Admin's
//   score        0-100 from the weights in Settings (no goal: attendance and
//                punctuality only); rating 1.0-5.0 = score / 20
// Admin may override the rating and the goal, write remarks and publish
// (performance_reviews); the final rating then wins.
class PerformanceScore
{
    public const LABELS = [
        [4.5, 'Outstanding'],
        [3.5, 'Very Satisfactory'],
        [2.5, 'Satisfactory'],
        [1.5, 'Needs Improvement'],
        [0, 'Poor'],
    ];

    public static function label(?float $rating): ?string
    {
        if ($rating === null) {
            return null;
        }
        foreach (self::LABELS as [$min, $label]) {
            if ($rating >= $min) {
                return $label;
            }
        }

        return 'Poor';
    }

    // The role whose work counts toward the goal, or null (Guards, Baggers, HR...).
    public static function roleOf(Employee $e): ?string
    {
        $u = $e->user;
        if (! $u) {
            return null;
        }
        if ($u->role === 'driver') {
            return 'driver';
        }

        return $u->role === 'employee' && in_array($u->sub_role, ['salesman', 'checker', 'maintenance'], true) ? $u->sub_role : null;
    }

    /** @return array<int, array> one row per employee, keyed by employee id */
    public static function forPeriod(string $start, string $end, Collection $employees): array
    {
        $today = DriverAvailability::today();
        $last = min($end, $today);
        $workDays = array_map('intval', explode(',', (string) Settings::get('attendance.work_days')));
        $holidays = Holiday::byDate();
        $ids = $employees->pluck('id');
        $userIds = $employees->pluck('user_id')->filter();

        $att = Attendance::whereIn('employee_id', $ids)->whereDate('date', '>=', $start)->whereDate('date', '<=', $last)->whereNotNull('time_in')
            ->get(['employee_id', 'date', 'late_minutes'])->groupBy('employee_id');
        $leaves = LeaveRequest::whereIn('employee_id', $ids)->where('status', 'approved')
            ->whereDate('start_date', '<=', $last)->whereDate('end_date', '>=', $start)
            ->get(['employee_id', 'start_date', 'end_date'])->groupBy('employee_id');
        $reviews = PerformanceReview::whereIn('employee_id', $ids)->whereDate('period_start', $start)->get()->keyBy('employee_id');

        $between = [$start.' 00:00:00', $end.' 23:59:59'];
        $work = [
            'driver' => Delivery::whereIn('driver_id', $userIds)->where('status', 'delivered')->whereBetween('delivered_at', $between)
                ->selectRaw('driver_id as u, COUNT(*) as n')->groupBy('driver_id')->pluck('n', 'u'),
            'salesman' => DeliveryProof::whereIn('salesman_id', $userIds)->whereBetween('confirmed_at', $between)
                ->selectRaw('salesman_id as u, COUNT(*) as n')->groupBy('salesman_id')->pluck('n', 'u'),
            'checker' => self::sum(
                IceLoading::whereIn('checker_id', $userIds)->whereBetween('loaded_at', $between)->selectRaw('checker_id as u, COUNT(*) as n')->groupBy('checker_id')->pluck('n', 'u'),
                StockMovement::whereIn('entered_by', $userIds)->whereBetween('created_at', $between)->selectRaw('entered_by as u, COUNT(*) as n')->groupBy('entered_by')->pluck('n', 'u'),
            ),
            'maintenance' => self::sum(
                StockOutRequest::whereIn('requested_by', $userIds)->whereBetween('created_at', $between)->selectRaw('requested_by as u, COUNT(*) as n')->groupBy('requested_by')->pluck('n', 'u'),
                Project::whereIn('created_by', $userIds)->whereBetween('created_at', $between)->selectRaw('created_by as u, COUNT(*) as n')->groupBy('created_by')->pluck('n', 'u'),
            ),
        ];

        $wAtt = (float) Settings::get('performance.weight_attendance');
        $wPun = (float) Settings::get('performance.weight_punctuality');
        $wGoal = (float) Settings::get('performance.weight_goal');

        $rows = [];
        foreach ($employees as $e) {
            $from = max($start, $e->date_hired ? Carbon::parse($e->date_hired)->toDateString() : $start);
            $leaveDays = [];
            foreach ($leaves->get($e->id, collect()) as $l) {
                foreach (CarbonPeriod::create(max($from, Carbon::parse($l->start_date)->toDateString()), min($last, Carbon::parse($l->end_date)->toDateString())) as $d) {
                    $leaveDays[$d->toDateString()] = true;
                }
            }
            $expected = 0;
            if ($from <= $last) {
                foreach (CarbonPeriod::create($from, $last) as $d) {
                    $ds = $d->toDateString();
                    if (in_array($d->isoWeekday(), $workDays, true) && ! isset($holidays[$ds]) && ! isset($leaveDays[$ds])) {
                        $expected++;
                    }
                }
            }

            $days = $att->get($e->id, collect())->unique(fn ($a) => Carbon::parse($a->date)->toDateString());
            $present = $days->count();
            $onTime = $days->filter(fn ($a) => (int) $a->late_minutes === 0)->count();

            $role = self::roleOf($e);
            $review = $reviews->get($e->id);
            $goal = $role ? ($review?->goal_target ?? (int) Settings::get("performance.goal_{$role}")) : null;
            $done = $role && $e->user_id ? (int) ($work[$role][$e->user_id] ?? 0) : null;

            $attRate = $expected > 0 ? min(1, $present / $expected) : null;
            $punRate = $present > 0 ? $onTime / $present : null;
            $goalRate = $goal ? min(1, $done / $goal) : null;

            $score = null;
            if ($attRate !== null) {
                $parts = [[$attRate, $wAtt], [$punRate ?? 0, $wPun]];
                if ($goalRate !== null) {
                    $parts[] = [$goalRate, $wGoal];
                }
                $weight = array_sum(array_column($parts, 1)) ?: 1;
                $score = round(100 * array_sum(array_map(fn ($p) => $p[0] * $p[1], $parts)) / $weight, 1);
            }
            $base = $score === null ? null : max(1.0, round($score / 20, 1));
            $final = $review?->final_rating;
            $rating = $final ?? $base;

            $rows[$e->id] = [
                'employee_id' => $e->id,
                'code' => $e->employee_id,
                'name' => $e->full_name,
                'department' => $e->department,
                'position' => $e->position,
                'role' => $role,
                'work_days' => $expected,
                'present_days' => $present,
                'on_time_days' => $onTime,
                'attendance_rate' => $attRate === null ? null : round($attRate * 100, 1),
                'punctuality_rate' => $punRate === null ? null : round($punRate * 100, 1),
                'goal_target' => $goal,
                'goal_done' => $done,
                'goal_completion' => $goalRate === null ? null : round($goalRate * 100, 1),
                'score' => $score,
                'base_rating' => $base,
                'final_rating' => $final,
                'rating' => $rating,
                'rating_label' => self::label($rating),
                'overridden' => $final !== null,
                'status' => $review?->status ?? 'draft',
                'remarks' => $review?->remarks,
                'published_at' => $review?->published_at?->toIso8601String(),
            ];
        }

        return $rows;
    }

    private static function sum(Collection ...$counts): Collection
    {
        $out = collect();
        foreach ($counts as $c) {
            foreach ($c as $k => $n) {
                $out[$k] = ($out[$k] ?? 0) + (int) $n;
            }
        }

        return $out;
    }
}
