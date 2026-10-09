<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Payroll;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PayrollController extends Controller
{
    // GET /api/payrolls
    // Optional filters: ?employee_id=, ?status=
    public function index(Request $request)
    {
        $query = Payroll::with(['employee', 'preparedBy:id,name']);

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(
            $query->orderBy('period_start', 'desc')->orderBy('created_at', 'desc')->get(),
            200
        );
    }

    // POST /api/payrolls
    // The computation (Sweldong Pinoy reference: SSS, PhilHealth, Pag-IBIG,
    // withholding tax) happens on the frontend. This endpoint checks the
    // period (no overlap, days worked within the period, net pay consistent)
    // and stores the computed values.
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'employee_id' => 'required|exists:employees,id',
            'period_start' => 'required|date|before_or_equal:today',
            'period_end' => 'required|date|after_or_equal:period_start',
            'days_worked' => 'required|numeric|min:0',
            'daily_rate' => 'required|numeric|min:0',
            'gross_pay' => 'required|numeric|min:0',
            'sss_deduction' => 'nullable|numeric|min:0',
            'philhealth_deduction' => 'nullable|numeric|min:0',
            'pagibig_deduction' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'other_deductions' => 'nullable|numeric|min:0',
            'net_pay' => 'required|numeric|min:0',
            'status' => 'nullable|in:pending,approved,paid',
            'notes' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Days worked cannot exceed the calendar days in the period.
        // (Carbon 3 returns a float from diffInDays, so round and cast to int.)
        $periodDays = (int) round(abs(Carbon::parse($request->period_start)
            ->startOfDay()
            ->diffInDays(Carbon::parse($request->period_end)->startOfDay()))) + 1;

        if ((float) $request->days_worked > $periodDays) {
            return response()->json(['errors' => [
                'days_worked' => ["Days worked ({$request->days_worked}) cannot be more than the {$periodDays} calendar days in this period."],
            ]], 422);
        }

        // One payroll per employee per period: block overlapping periods.
        $overlap = Payroll::where('employee_id', $request->employee_id)
            ->whereDate('period_start', '<=', $request->period_end)
            ->whereDate('period_end', '>=', $request->period_start)
            ->first();

        if ($overlap) {
            $from = Carbon::parse($overlap->period_start)->format('M j, Y');
            $to = Carbon::parse($overlap->period_end)->format('M j, Y');

            return response()->json(['errors' => [
                'period_start' => ["This employee already has a payroll for {$from} to {$to}. Payroll periods cannot overlap."],
            ]], 422);
        }

        // Net pay must equal gross pay minus all deductions.
        $deductions = (float) ($request->sss_deduction ?? 0)
            + (float) ($request->philhealth_deduction ?? 0)
            + (float) ($request->pagibig_deduction ?? 0)
            + (float) ($request->tax_deduction ?? 0)
            + (float) ($request->other_deductions ?? 0);

        if (abs(((float) $request->gross_pay - $deductions) - (float) $request->net_pay) > 0.01) {
            return response()->json(['errors' => [
                'net_pay' => ['Net pay does not match gross pay minus total deductions.'],
            ]], 422);
        }

        $status = $request->status ?? 'pending';

        $payroll = Payroll::create([
            'employee_id' => $request->employee_id,
            'period_start' => $request->period_start,
            'period_end' => $request->period_end,
            'days_worked' => $request->days_worked,
            'daily_rate' => $request->daily_rate,
            'gross_pay' => $request->gross_pay,
            'sss_deduction' => $request->sss_deduction ?? 0,
            'philhealth_deduction' => $request->philhealth_deduction ?? 0,
            'pagibig_deduction' => $request->pagibig_deduction ?? 0,
            'tax_deduction' => $request->tax_deduction ?? 0,
            'other_deductions' => $request->other_deductions ?? 0,
            'net_pay' => $request->net_pay,
            'status' => $status,
            'prepared_by' => auth()->id(),
            'paid_at' => $status === 'paid' ? now() : null,
            'notes' => $request->notes ?? null,
        ]);

        return response()->json(['message' => 'Payroll record created.', 'data' => $payroll], 201);
    }

    // GET /api/payrolls/{id}
    public function show($id)
    {
        $payroll = Payroll::with(['employee', 'preparedBy:id,name'])->find($id);

        if (! $payroll) {
            return response()->json(['message' => 'Payroll not found.'], 404);
        }

        return response()->json($payroll, 200);
    }

    // PUT /api/payrolls/{id}
    // Also used by the Payroll page for status changes
    // (pending -> approved -> paid). paid_at is set when marked paid.
    public function update(Request $request, $id)
    {
        $payroll = Payroll::find($id);

        if (! $payroll) {
            return response()->json(['message' => 'Payroll not found.'], 404);
        }

        $validator = Validator::make($request->all(), [
            'period_start' => 'sometimes|date|before_or_equal:today',
            'period_end' => 'sometimes|date|after_or_equal:period_start',
            'days_worked' => 'sometimes|numeric|min:0',
            'daily_rate' => 'sometimes|numeric|min:0',
            'gross_pay' => 'sometimes|numeric|min:0',
            'sss_deduction' => 'sometimes|nullable|numeric|min:0',
            'philhealth_deduction' => 'sometimes|nullable|numeric|min:0',
            'pagibig_deduction' => 'sometimes|nullable|numeric|min:0',
            'tax_deduction' => 'sometimes|nullable|numeric|min:0',
            'other_deductions' => 'sometimes|nullable|numeric|min:0',
            'net_pay' => 'sometimes|numeric|min:0',
            'status' => 'sometimes|in:pending,approved,paid',
            'notes' => 'sometimes|nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // When only one end of the period is sent, compare it with the stored other end.
        $newStart = $request->input('period_start', $payroll->period_start);
        $newEnd = $request->input('period_end', $payroll->period_end);
        if (Carbon::parse($newEnd)->lt(Carbon::parse($newStart))) {
            return response()->json(['errors' => [
                'period_end' => ['Period end cannot be before period start.'],
            ]], 422);
        }

        $data = $request->only([
            'period_start', 'period_end', 'days_worked', 'daily_rate',
            'gross_pay', 'sss_deduction', 'philhealth_deduction',
            'pagibig_deduction', 'tax_deduction', 'other_deductions',
            'net_pay', 'status', 'notes',
        ]);

        if ($request->has('status')) {
            $data['paid_at'] = $request->status === 'paid'
                ? ($payroll->paid_at ?? now())
                : null;
        }

        $payroll->update($data);

        return response()->json([
            'message' => 'Payroll updated.',
            'data' => $payroll->fresh(['employee', 'preparedBy:id,name']),
        ], 200);
    }

    // DELETE /api/payrolls/{id}
    public function destroy($id)
    {
        $payroll = Payroll::find($id);

        if (! $payroll) {
            return response()->json(['message' => 'Payroll not found.'], 404);
        }

        $payroll->delete();

        return response()->json(['message' => 'Payroll record deleted.'], 200);
    }
}
