<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Support\Audit;
use App\Support\PayPeriod;
use App\Support\PayrollCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// HR: the timesheet of every active employee for one pay period (days present,
// absences, late minutes, leave). Approving a timesheet makes the employee's
// payroll for that period (worked out by App\Support\PayrollCalculator), which
// Admin then pays (PayrollController). HR sees no pay amounts here: salary is
// confidential.
class TimesheetController extends Controller
{
    // GET /api/timesheets?date=Y-m-d (any date in the period; default today)
    public function index(Request $request)
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $period = PayPeriod::for($request->input('date', now(config('atice.timezone'))->toDateString()));
        $start = CarbonImmutable::parse($period['start']);
        $end = CarbonImmutable::parse($period['end']);

        $payrolls = Payroll::whereDate('period_start', $period['start'])->get()->keyBy('employee_id');

        $rows = $this->employees($period)->map(function (Employee $e) use ($start, $end, $payrolls) {
            $sheet = PayrollCalculator::timesheet($e, $start, $end);
            $p = $payrolls->get($e->id);

            return [
                'id' => $e->id,
                'employee_id' => $e->employee_id,
                'name' => $e->full_name,
                'position' => $e->position,
                'employment_status' => $e->employment_status,
                'days_present' => $sheet['days_present'],
                'absent_days' => $sheet['absent_days'],
                'late_minutes' => $sheet['late_minutes'],
                'paid_leave_days' => $sheet['paid_leave_days'],
                'unpaid_leave_days' => $sheet['unpaid_leave_days'],
                'unpaid_leave_hours' => $sheet['unpaid_leave_hours'],
                'missing_time_out' => $sheet['missing_time_out'],
                'holiday_days' => $sheet['holiday_days_present'],
                'ot_pending_minutes' => $sheet['ot_pending_minutes'],
                'ot_approved_hours' => $sheet['ot_hours'],
                // not_approved | unpaid (approved, waiting for pay) | paid
                'status' => $p ? $p->status : 'not_approved',
                'approved_at' => $p?->timesheet_approved_at,
            ];
        })->sortBy('employee_id')->values();

        return response()->json(['period' => $period, 'rows' => $rows]);
    }

    // POST /api/timesheets/approve { date, employee_ids: [] }
    // Approves the timesheets: each makes (or redoes) that employee's payroll for
    // the period. A paid payroll is final and is not touched.
    public function approve(Request $request)
    {
        $data = $request->validate([
            'date' => 'required|date_format:Y-m-d',
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'integer|exists:employees,id',
            // Overtime is paid only for the employees HR ticks here (R3).
            'approve_ot_ids' => 'nullable|array',
            'approve_ot_ids.*' => 'integer|exists:employees,id',
        ]);
        $approveOt = $data['approve_ot_ids'] ?? [];
        $period = PayPeriod::for($data['date']);
        if ($period['end'] > now(config('atice.timezone'))->toDateString()) {
            throw ValidationException::withMessages(['date' => ['A timesheet can be approved once its pay period has ended ('.$period['end'].').']]);
        }

        $approved = 0;
        $skipped = [];
        foreach ($this->employees($period)->whereIn('id', $data['employee_ids']) as $employee) {
            $payroll = Payroll::firstOrNew(['employee_id' => $employee->id, 'period_start' => $period['start']]);
            if ($payroll->exists && $payroll->status === 'paid') {
                $skipped[] = $employee->employee_id;

                continue;
            }
            if (in_array($employee->id, $approveOt, true)) {
                $ot = Attendance::where('employee_id', $employee->id)->where('ot_minutes', '>', 0)->where('ot_approved', false)
                    ->whereDate('date', '>=', $period['start'])->whereDate('date', '<=', $period['end']);
                $minutes = (int) $ot->sum('ot_minutes');
                $ot->update(['ot_approved' => true]);
                if ($minutes > 0) {
                    Audit::log('overtime.approved', $employee, null, ['minutes' => $minutes, 'period' => $period['start'].' to '.$period['end']]);
                }
            }
            $adjustments = $payroll->exists ? $payroll->adjustments()->get(['amount', 'taxable'])->toArray() : [];
            $payroll->fill(PayrollCalculator::compute($employee, $period, $adjustments) + [
                'period_end' => $period['end'],
                'status' => 'unpaid',
                'prepared_by' => $request->user()->id,
                'timesheet_approved_by' => $request->user()->id,
                'timesheet_approved_at' => now(),
            ])->save();
            Audit::log('timesheet.approved', $payroll, null, ['employee_id' => $employee->employee_id, 'period' => $period['start'].' to '.$period['end']]);
            $approved++;
        }

        return response()->json([
            'message' => "{$approved} timesheet".($approved === 1 ? '' : 's').' approved.'.($skipped ? ' Already paid, not changed: '.implode(', ', $skipped).'.' : ''),
            'approved' => $approved,
            'skipped' => $skipped,
        ]);
    }

    // Employees on the payroll in a period: active, hired by its end.
    private function employees(array $period)
    {
        return Employee::where('is_active', true)
            ->whereDate('date_hired', '<=', $period['end'])
            ->get();
    }
}
