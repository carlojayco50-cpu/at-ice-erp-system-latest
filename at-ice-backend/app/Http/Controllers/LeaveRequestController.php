<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Support\Audit;
use App\Support\LeaveCredits;
use App\Support\Settings;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

// Leave (docs/REVIEW-DECISIONS.md). Employees file their own leave; HR only
// approves or rejects (a rejection needs a reason).
//   EL  emergency leave, filed in hours for one day
//   SL  sick leave, for past dates only, filed at most
//       leave.sl_filing_window_days after returning; needs leave credits and a
//       medical certificate. Never approved on its own.
//   VL  vacation leave, starting at least leave.vl_notice_days ahead
//   All blocked while probationary; no overlapping requests.
// When HR approves, the days are paid from the employee's leave credits as far
// as they go (LeaveCredits); the rest is unpaid and is deducted in payroll and
// the 13th month. HR may mark an SL unpaid.
class LeaveRequestController extends Controller
{
    private const TYPES = 'sick,vacation,emergency';

    private function today(): Carbon
    {
        return Carbon::now(config('atice.timezone'))->startOfDay();
    }

    // Number of days: 0.5 for a half day, otherwise start to end inclusive,
    // leaving out holidays (no leave is needed on a holiday, R3).
    private function computeDays(string $start, string $end, bool $half): float
    {
        if ($half) {
            return 0.5;
        }
        $days = 0;
        foreach (CarbonPeriod::create($start, $end) as $d) {
            if (! Holiday::forDate($d->toDateString())) {
                $days++;
            }
        }

        return (float) $days;
    }

    // The Employee row linked to the logged in user (employees.user_id).
    private function myEmployee(Request $request): ?Employee
    {
        return Employee::where('user_id', $request->user()->id)
            ->where('is_active', true)
            ->first();
    }

    // A pending or approved leave of this employee that shares a day with start..end.
    private function overlaps(int $employeeId, string $start, string $end): bool
    {
        return LeaveRequest::where('employee_id', $employeeId)
            ->whereIn('status', ['pending', 'approved'])
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start)
            ->exists();
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }

    // HR SIDE

    // GET /api/leave-requests?status=&employee_id=  (with each employee's credits)
    public function index(Request $request)
    {
        $leaves = LeaveRequest::with(['employee', 'approvedBy:id,name'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderBy('created_at', 'desc')
            ->get();

        $credits = [];
        foreach ($leaves as $leave) {
            if ($leave->employee && ! isset($credits[$leave->employee_id])) {
                $credits[$leave->employee_id] = LeaveCredits::for($leave->employee);
            }
            $leave->setAttribute('credits', $credits[$leave->employee_id] ?? null);
            $leave->setAttribute('has_attachment', (bool) $leave->attachment_path);
        }

        return response()->json($leaves, 200);
    }

    // GET /api/leave-requests/{id}
    public function show($id)
    {
        $leave = LeaveRequest::with(['employee', 'approvedBy:id,name'])->find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        return response()->json($leave, 200);
    }

    // PUT /api/leave-requests/{id}/status
    //   { status: "approved", remarks?, is_paid? (SL only) }
    //   { status: "rejected", reject_reason }
    public function updateStatus(Request $request, $id)
    {
        $leave = LeaveRequest::with('employee')->find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        $data = $request->validate([
            'status' => 'required|in:approved,rejected',
            'reject_reason' => 'required_if:status,rejected|nullable|string|min:3|max:300',
            'remarks' => 'nullable|string|max:300',
            'admin_notes' => 'nullable|string|max:300', // older field name, still accepted
            'is_paid' => 'nullable|boolean',
        ], [
            'reject_reason.required_if' => 'Give the reason for rejecting this leave.',
        ]);

        if ($leave->status !== 'pending') {
            return response()->json(['message' => "This leave request was already {$leave->status}."], 422);
        }

        $update = [
            'status' => $data['status'],
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'admin_notes' => $data['remarks'] ?? $data['admin_notes'] ?? null,
        ];

        if ($data['status'] === 'rejected') {
            $update['reject_reason'] = $data['reject_reason'];
        } else {
            // Paid from the credits as far as they go; the rest is unpaid.
            $days = LeaveCredits::days($leave);
            $available = $leave->employee ? LeaveCredits::for($leave->employee, $leave->start_date->toDateString())['available'] : 0;
            $wantsPaid = $leave->leave_type !== 'sick' || $request->boolean('is_paid', true);
            $paid = $wantsPaid ? min($days, $available) : 0;
            $update += [
                'paid_days' => round($paid, 2),
                'unpaid_days' => round($days - $paid, 2),
                'is_paid' => $paid >= $days,
            ];
        }

        $before = ['status' => $leave->status];
        $leave->update($update);
        Audit::log('leave.'.$data['status'], $leave, $before, array_intersect_key($update, array_flip(['status', 'reject_reason', 'admin_notes', 'paid_days', 'unpaid_days', 'is_paid'])));

        return response()->json([
            'message' => 'Leave request updated.',
            'data' => $leave->load(['employee', 'approvedBy:id,name']),
        ], 200);
    }

    // DELETE /api/leave-requests/{id} (pending only)
    public function destroy($id)
    {
        $leave = LeaveRequest::find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 403);
        }

        $this->deleteAttachment($leave);
        $leave->delete();

        return response()->json(['message' => 'Leave request cancelled.'], 200);
    }

    // GET /api/leave-requests/{id}/attachment : the med cert or other file (HR)
    public function attachment($id)
    {
        return $this->sendAttachment(LeaveRequest::findOrFail($id));
    }

    // EMPLOYEE / DRIVER SIDE (own requests only)

    // GET /api/my-leave-requests
    public function myIndex(Request $request)
    {
        $employee = $this->myEmployee($request);

        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this login.'], 404);
        }

        $leaves = LeaveRequest::with('approvedBy:id,name')
            ->where('employee_id', $employee->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($leaves, 200);
    }

    // GET /api/my-leave-credits : credits and the filing rules for the form
    public function myCredits(Request $request)
    {
        $employee = $this->myEmployee($request);
        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this login.'], 404);
        }

        return response()->json(LeaveCredits::for($employee) + [
            'probationary' => $employee->employment_status !== 'regular',
            'hours_per_day' => (float) Settings::get('payroll.hours_per_day'),
            'sl_filing_window_days' => (int) Settings::get('leave.sl_filing_window_days'),
            'vl_notice_days' => (int) Settings::get('leave.vl_notice_days'),
        ]);
    }

    // POST /api/my-leave-requests (multipart/form-data; the med cert is "attachment")
    public function myStore(Request $request)
    {
        $employee = $this->myEmployee($request);

        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this login.'], 404);
        }

        if ($employee->employment_status !== 'regular') {
            $this->fail('leave_type', 'Leave cannot be filed while probationary. Absences during probation are unpaid.');
        }

        $request->validate([
            'leave_type' => 'required|in:'.self::TYPES,
            'start_date' => 'required|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
            'is_half_day' => 'nullable|boolean',
            'hours' => 'required_if:leave_type,emergency|nullable|numeric|min:0.5|max:'.(float) Settings::get('payroll.hours_per_day'),
            'reason' => 'required|string|max:500',
            'attachment' => 'nullable|file|mimes:png,jpg,jpeg,pdf|max:5120',
        ], [
            'hours.required_if' => 'Enter how many hours of emergency leave.',
        ]);

        $type = $request->leave_type;
        $today = $this->today();
        $start = Carbon::parse($request->start_date);
        $half = $type !== 'emergency' && $request->boolean('is_half_day');
        $end = ($type === 'emergency' || $half) ? $start->copy() : Carbon::parse($request->end_date ?? $request->start_date);

        // Holidays need no leave: a request only on holidays is refused, and
        // holidays inside a longer request are not counted (computeDays).
        if ($type === 'emergency' || $half || $start->equalTo($end)) {
            if ($h = Holiday::forDate($start->toDateString())) {
                $this->fail('start_date', "{$start->format('M j, Y')} is a holiday ({$h->name}). No leave is needed: you are not marked absent on a holiday.");
            }
        } elseif ($this->computeDays($start->toDateString(), $end->toDateString(), false) === 0.0) {
            $this->fail('start_date', 'Every day in this range is a holiday. No leave is needed.');
        }

        $credits = LeaveCredits::for($employee);
        $days = $type === 'emergency'
            ? (float) $request->hours / (float) Settings::get('payroll.hours_per_day')
            : $this->computeDays($start->toDateString(), $end->toDateString(), $half);

        if ($type === 'sick') {
            $window = (int) Settings::get('leave.sl_filing_window_days');
            if ($end->gte($today)) {
                $this->fail('start_date', 'Sick leave is filed after you return, for past dates only.');
            }
            if ($end->lt($today->copy()->subDays($window))) {
                $this->fail('start_date', "Sick leave must be filed at most {$window} day".($window === 1 ? '' : 's').' after you return.');
            }
            if (! $request->hasFile('attachment')) {
                $this->fail('attachment', 'Attach your medical certificate.');
            }
            if ($credits['available'] < $days) {
                $this->fail('leave_type', "Not enough leave credits for sick leave ({$credits['available']} day(s) left).");
            }
        }
        if ($type === 'vacation') {
            $notice = (int) Settings::get('leave.vl_notice_days');
            if ($start->lt($today->copy()->addDays($notice))) {
                $this->fail('start_date', "Vacation leave must start at least {$notice} days from today (on or after {$today->copy()->addDays($notice)->format('M j, Y')}).");
            }
        }

        if ($this->overlaps($employee->id, $start->toDateString(), $end->toDateString())) {
            $this->fail('start_date', 'You already have a pending or approved leave on those dates.');
        }

        // Kept private: only HR and the employee can open it (attachment routes).
        $path = $request->hasFile('attachment') ? $request->file('attachment')->store('leave-attachments', 'local') : null;

        $leave = LeaveRequest::create([
            'employee_id' => $employee->id,
            'leave_type' => $type,
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'total_days' => $type === 'emergency' ? round($days, 2) : $days,
            'hours' => $type === 'emergency' ? $request->hours : null,
            'is_half_day' => $half,
            'reason' => $request->reason,
            'status' => 'pending',
            'attachment_path' => $path,
            'attachment_disk' => 'local',
        ]);

        return response()->json([
            'message' => $credits['available'] >= $days
                ? 'Leave request sent. It will be paid from your leave credits once HR approves it.'
                : 'Leave request sent. You do not have enough leave credits, so it will be unpaid.',
            'data' => $leave->load('approvedBy:id,name'),
            'credits' => $credits,
        ], 201);
    }

    // DELETE /api/my-leave-requests/{id} (own, pending only)
    public function myDestroy(Request $request, $id)
    {
        $employee = $this->myEmployee($request);

        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this login.'], 404);
        }

        $leave = LeaveRequest::where('employee_id', $employee->id)->find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 403);
        }

        $this->deleteAttachment($leave);
        $leave->delete();

        return response()->json(['message' => 'Leave request cancelled.'], 200);
    }

    // GET /api/my-leave-requests/{id}/attachment (own)
    public function myAttachment(Request $request, $id)
    {
        $employee = $this->myEmployee($request);
        abort_unless($employee, 404);

        return $this->sendAttachment(LeaveRequest::where('employee_id', $employee->id)->findOrFail($id));
    }

    private function sendAttachment(LeaveRequest $leave)
    {
        $disk = Storage::disk($leave->attachment_disk ?: 'public');
        if (! $leave->attachment_path || ! $disk->exists($leave->attachment_path)) {
            return response()->json(['message' => 'This leave request has no attachment.'], 404);
        }

        return $disk->response($leave->attachment_path, basename($leave->attachment_path), [
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ], 'inline');
    }

    private function deleteAttachment(LeaveRequest $leave): void
    {
        if ($leave->attachment_path) {
            Storage::disk($leave->attachment_disk ?: 'public')->delete($leave->attachment_path);
        }
    }
}
