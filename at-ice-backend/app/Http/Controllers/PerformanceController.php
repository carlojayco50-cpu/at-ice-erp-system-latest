<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceReview;
use App\Support\Audit;
use App\Support\DriverAvailability;
use App\Support\PayPeriod;
use App\Support\PerformanceScore;
use Carbon\Carbon;
use Illuminate\Http\Request;

// Admin > HRIS > Performance (owner, 2026-10-20): every active employee's
// Draft Base Rating for a pay period (App\Support\PerformanceScore), with
// Admin's overrides. Only Admin reads and writes it (role:admin routes).
class PerformanceController extends Controller
{
    // The last 12 pay periods, newest first.
    private function periods(): array
    {
        $out = [];
        $date = DriverAvailability::today();
        for ($i = 0; $i < 12; $i++) {
            $p = PayPeriod::for($date);
            $out[] = ['start' => $p['start'], 'end' => $p['end']];
            $date = Carbon::parse($p['start'])->subDay()->toDateString();
        }

        return $out;
    }

    private function period(Request $request): array
    {
        $start = $request->query('period_start');
        $p = PayPeriod::for($start && strtotime($start) ? $start : DriverAvailability::today());

        return ['start' => $p['start'], 'end' => $p['end']];
    }

    // GET /api/performance?period_start=
    public function index(Request $request)
    {
        $period = $this->period($request);
        $employees = Employee::with('user:id,role,sub_role')->where('is_active', true)->whereNull('anonymized_at')
            ->orderBy('last_name')->orderBy('first_name')->get();

        return response()->json([
            'period' => $period,
            'periods' => $this->periods(),
            'labels' => array_column(PerformanceScore::LABELS, 1),
            'rows' => array_values(PerformanceScore::forPeriod($period['start'], $period['end'], $employees)),
        ]);
    }

    // PUT /api/performance/{employee}?period_start=  Admin overrides the rating
    // or the goal, writes remarks, and may publish (published is final until
    // Admin changes it again; every change is audited).
    public function update(Request $request, Employee $employee)
    {
        $data = $request->validate([
            'final_rating' => 'nullable|numeric|between:1,5',
            'goal_target' => 'nullable|integer|min:1|max:100000',
            'remarks' => 'nullable|string|max:2000',
            'publish' => 'sometimes|boolean',
        ]);
        $period = $this->period($request);

        $review = PerformanceReview::firstOrNew(['employee_id' => $employee->id, 'period_start' => $period['start']]);
        $before = $review->exists ? $review->only(['final_rating', 'goal_target', 'remarks', 'status']) : null;
        $review->fill([
            'period_end' => $period['end'],
            'final_rating' => isset($data['final_rating']) ? round((float) $data['final_rating'], 1) : null,
            'goal_target' => $data['goal_target'] ?? null,
            'remarks' => $data['remarks'] ?? null,
            'updated_by' => $request->user()->id,
        ]);
        if ($request->boolean('publish')) {
            $review->fill(['status' => 'published', 'published_by' => $request->user()->id, 'published_at' => now()]);
        } elseif (! $review->exists || $review->status !== 'published') {
            $review->status = 'draft';
        }
        $review->save();

        Audit::log($request->boolean('publish') ? 'performance.published' : 'performance.updated', $review, $before,
            $review->only(['final_rating', 'goal_target', 'remarks', 'status']));

        $row = PerformanceScore::forPeriod($period['start'], $period['end'], collect([$employee->load('user:id,role,sub_role')]))[$employee->id];

        return response()->json([
            'message' => $request->boolean('publish') ? "Appraisal of {$employee->full_name} published." : "Appraisal of {$employee->full_name} saved.",
            'row' => $row,
        ]);
    }
}
