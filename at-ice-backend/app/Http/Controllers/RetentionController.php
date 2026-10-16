<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Support\ArchiveExpiry;
use App\Support\Audit;
use App\Support\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Admin review of records past the retention period (retention.years,
// default 2; docs/REVIEW-DECISIONS.md). With archive.expiry_action REVIEW (the
// default) nothing is changed on its own; ANONYMIZE or PURGE is applied daily
// by App\Support\ArchiveExpiry. For each record Admin chooses: download the
// CSV (GET attendances/export), keep (hidden from the review for another
// retention period), anonymize (employees) or delete. Every choice is audited.
//   employees         inactive for longer than the retention period
//   attendance years  calendar years whose attendance is all older than it
class RetentionController extends Controller
{
    private function cutoff(): string
    {
        return ArchiveExpiry::cutoff();
    }

    private function held(string $kind): array
    {
        return DB::table('retention_holds')->where('kind', $kind)->whereDate('kept_until', '>=', now(config('atice.timezone'))->toDateString())->pluck('ref')->all();
    }

    // GET /api/retention-review
    public function index()
    {
        $cutoff = $this->cutoff();

        $employees = ArchiveExpiry::expired()
            ->withCount('attendances')
            ->orderBy('deactivated_at')
            ->get()
            ->map(fn (Employee $e) => [
                'id' => $e->id,
                'employee_id' => $e->employee_id,
                'name' => $e->full_name,
                'deactivated_at' => $e->deactivated_at?->toDateString(),
                'attendance_count' => $e->attendances_count,
            ]);

        $lastFullYear = (int) substr($cutoff, 0, 4) - (substr($cutoff, 5) === '12-31' ? 0 : 1);
        $years = Attendance::query()
            ->whereDate('date', '<=', $lastFullYear.'-12-31')
            ->get(['date'])
            ->groupBy(fn ($a) => $a->date->year)
            ->map(fn ($rows, $year) => ['year' => (int) $year, 'count' => $rows->count()])
            ->reject(fn ($r) => in_array((string) $r['year'], $this->held('attendance_year'), true))
            ->sortKeys()
            ->values();

        return response()->json([
            'retention_years' => (int) Settings::get('retention.years'),
            'expiry_action' => Settings::get('archive.expiry_action'),
            'cutoff' => $cutoff,
            'employees' => $employees,
            'attendance_years' => $years,
        ]);
    }

    // POST /api/retention-review/keep { kind, ref }
    public function keep(Request $request)
    {
        $data = $this->target($request);
        $until = now(config('atice.timezone'))->addYears((int) Settings::get('retention.years'))->toDateString();
        DB::table('retention_holds')->updateOrInsert(
            ['kind' => $data['kind'], 'ref' => (string) $data['ref']],
            ['kept_until' => $until, 'kept_by' => $request->user()->id, 'updated_at' => now(), 'created_at' => now()]
        );
        Audit::log('retention.kept', null, null, $data + ['kept_until' => $until]);

        return response()->json(['message' => "Kept until {$until}."]);
    }

    // POST /api/retention-review/delete { kind, ref }
    public function delete(Request $request)
    {
        $data = $this->target($request);

        if ($data['kind'] === 'employee') {
            $employee = Employee::where('is_active', false)->findOrFail($data['ref']);
            $label = "{$employee->employee_id} {$employee->full_name}";
            ArchiveExpiry::purge($employee);

            return response()->json(['message' => "{$label} and their records were deleted."]);
        }

        $year = (int) $data['ref'];
        if ($year.'-12-31' > $this->cutoff()) {
            return response()->json(['message' => "{$year} is still inside the retention period."], 422);
        }
        $count = Attendance::whereYear('date', $year)->delete();
        Audit::log('retention.deleted', null, ['attendance_year' => $year, 'rows' => $count], null);

        return response()->json(['message' => "{$count} attendance record(s) from {$year} were deleted."]);
    }

    // POST /api/retention-review/anonymize { ref } : remove an inactive
    // employee's personal details but keep the employee ID and pay history.
    public function anonymize(Request $request)
    {
        $data = $request->validate(['ref' => 'required|integer|min:1']);
        $employee = Employee::where('is_active', false)->whereNull('anonymized_at')->findOrFail($data['ref']);
        $label = $employee->employee_id;
        ArchiveExpiry::anonymize($employee);

        return response()->json(['message' => "{$label} was anonymized."]);
    }

    private function target(Request $request): array
    {
        return $request->validate([
            'kind' => 'required|in:employee,attendance_year',
            'ref' => 'required|integer|min:1',
        ]);
    }
}
