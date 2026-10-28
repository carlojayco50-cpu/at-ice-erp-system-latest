<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Payroll;
use App\Models\PayrollAdjustment;
use App\Support\Audit;
use App\Support\PayPeriod;
use App\Support\PayrollCalculator;
use App\Support\PayrollCalendar;
use App\Support\Settings;
use App\Support\ThirteenthMonth;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// Payroll (docs/REVIEW-DECISIONS.md). HR approves timesheets
// (TimesheetController), which makes each payroll; HR processes the pay
// here: Payroll Records for one pay period, adjustments (bonus, incentive,
// referral bonus), marking paid (final, audited), payslips and the 13th month.
// Salary is confidential: no totals or summaries are returned.
class PayrollController extends Controller
{
    // GET /api/payroll-periods (HR): the latest pay periods
    public function periods()
    {
        return response()->json(array_map(
            fn ($p) => $p + ['missing' => PayrollCalendar::missing($p)->count()],
            PayrollCalendar::recent(6)
        ));
    }

    // GET /api/payrolls (HR): which periods are paid, without amounts
    public function index(Request $request)
    {
        return response()->json(Payroll::query()
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->orderByDesc('period_start')
            ->get(['id', 'employee_id', 'period_start', 'period_end', 'pay_day', 'status', 'paid_at']));
    }

    // GET /api/payroll-records?date=&status=unpaid|paid (HR): every active
    // employee for the pay period, with their payroll once HR approved it.
    public function records(Request $request)
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d', 'status' => 'nullable|in:unpaid,paid']);
        $period = PayPeriod::for($request->input('date', now(config('atice.timezone'))->toDateString()));

        $payrolls = Payroll::with('adjustments')->whereDate('period_start', $period['start'])->get()->keyBy('employee_id');
        $employees = Employee::where(fn ($q) => $q->where('is_active', true)->whereDate('date_hired', '<=', $period['end']))
            ->orWhereIn('id', $payrolls->keys())
            ->get();

        $rows = $employees->map(fn (Employee $e) => [
            'id' => $e->id,
            'employee_id' => $e->employee_id,
            'name' => $e->full_name,
            'position' => $e->position,
            'payroll' => $payrolls->get($e->id),
        ])
            ->filter(fn ($r) => ! $request->filled('status') || ($r['payroll'] && $r['payroll']->status === $request->status))
            ->sortBy('employee_id')->values();

        return response()->json([
            'period' => $period,
            'gov_share' => PayrollCalculator::governmentShare($period['pay_day']),
            'gov_strategy' => Settings::get('payroll.gov_deduction_strategy'),
            'rows' => $rows,
        ]);
    }

    // GET /api/payrolls/{id}/payslip (HR): everything on the payslip
    public function payslip($id)
    {
        return response()->json(Payroll::with(['employee', 'adjustments'])->findOrFail($id));
    }

    // POST /api/payrolls/{id}/adjustments { label, amount, taxable } (HR)
    public function addAdjustment(Request $request, $id)
    {
        $payroll = $this->unpaid($id);
        $data = $request->validate([
            'label' => 'required|string|max:100',
            'amount' => 'required|numeric|min:0.01|max:1000000',
            'taxable' => 'required|boolean',
        ]);
        $adj = $payroll->adjustments()->create($data + ['created_by' => $request->user()->id]);
        PayrollCalculator::refresh($payroll->fresh());
        Audit::log('payroll.adjustment_added', $payroll, null, $adj->only(['label', 'amount', 'taxable']));

        return response()->json($payroll->fresh()->load('adjustments'), 201);
    }

    // DELETE /api/payroll-adjustments/{id} (HR)
    public function removeAdjustment($id)
    {
        $adj = PayrollAdjustment::findOrFail($id);
        $payroll = $this->unpaid($adj->payroll_id);
        $adj->delete();
        PayrollCalculator::refresh($payroll->fresh());
        Audit::log('payroll.adjustment_removed', $payroll, $adj->only(['label', 'amount', 'taxable']), null);

        return response()->json($payroll->fresh()->load('adjustments'));
    }

    // POST /api/payrolls/mark-paid { ids: [] } (HR). Paid is final.
    public function markPaid(Request $request)
    {
        $data = $request->validate(['ids' => 'required|array|min:1', 'ids.*' => 'integer|exists:payrolls,id']);
        $count = 0;
        foreach (Payroll::whereIn('id', $data['ids'])->where('status', 'unpaid')->get() as $payroll) {
            $payroll->update(['status' => 'paid', 'paid_at' => now(), 'paid_by' => $request->user()->id]);
            Audit::log('payroll.paid', $payroll, ['status' => 'unpaid'], ['status' => 'paid', 'net_pay' => (string) $payroll->net_pay]);
            $count++;
        }

        return response()->json(['message' => "{$count} payroll".($count === 1 ? '' : 's').' marked paid.', 'paid' => $count]);
    }

    // GET /api/thirteenth-month?year= (HR): each employee's 13th month pay so far
    public function thirteenthMonth(Request $request)
    {
        $year = (int) $request->input('year', now(config('atice.timezone'))->year);
        $rows = Employee::where('is_active', true)->orderBy('employee_id')->get()->map(fn (Employee $e) => [
            'id' => $e->id,
            'employee_id' => $e->employee_id,
            'name' => $e->full_name,
        ] + ThirteenthMonth::for($e, $year));

        return response()->json(['year' => $year, 'credit_date' => $year.'-'.Settings::get('thirteenth.credit_date'), 'rows' => $rows]);
    }

    private function unpaid($id): Payroll
    {
        $payroll = Payroll::findOrFail($id);
        if ($payroll->status === 'paid') {
            throw ValidationException::withMessages(['payroll' => ['This payroll is already paid and can no longer be changed.']]);
        }

        return $payroll;
    }
}
