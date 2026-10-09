<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveRequest;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class LeaveRequestController extends Controller
{
    private const LEAVE_TYPES = 'sick,vacation,emergency,maternity,paternity,other';

    // Types an employee can file by themselves from the portal.
    private const SELF_SERVICE_TYPES = 'sick,vacation,emergency';

    // Number of days: 0.5 for a half day, otherwise start to end inclusive.
    private function computeDays(string $start, string $end, bool $half): float
    {
        if ($half) {
            return 0.5;
        }

        return (float) ((int) Carbon::parse($start)->startOfDay()
            ->diffInDays(Carbon::parse($end)->startOfDay()) + 1);
    }

    // The Employee row linked to the logged in user (employees.user_id).
    private function myEmployee(Request $request): ?Employee
    {
        return Employee::where('user_id', $request->user()->id)
            ->where('is_active', true)
            ->first();
    }

    // HR SIDE

    // GET /api/leave-requests
    // Optional filters: ?employee_id=, ?status=
    public function index(Request $request)
    {
        $query = LeaveRequest::with(['employee', 'approvedBy:id,name']);

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get(), 200);
    }

    // POST /api/leave-requests
    // HR encodes the leave on behalf of the employee (verbal or paper request).
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'employee_id' => 'required|exists:employees,id',
            'leave_type' => 'required|in:'.self::LEAVE_TYPES,
            'start_date' => 'required|date|after_or_equal:today',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'required|string|max:500',
            'is_half_day' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $half = $request->boolean('is_half_day');
        $end = $half ? $request->start_date : $request->end_date;

        $leave = LeaveRequest::create([
            'employee_id' => $request->employee_id,
            'leave_type' => $request->leave_type,
            'start_date' => $request->start_date,
            'end_date' => $end,
            'total_days' => $this->computeDays($request->start_date, $end, $half),
            'is_half_day' => $half,
            'reason' => $request->reason,
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Leave request submitted.',
            'data' => $leave->load(['employee', 'approvedBy:id,name']),
        ], 201);
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
    // Approve or reject a PENDING request. approved_by / approved_at record
    // who decided and when, for both approve and reject.
    public function updateStatus(Request $request, $id)
    {
        $leave = LeaveRequest::find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:approved,rejected',
            'admin_notes' => 'nullable|string|max:300',
            'remarks' => 'nullable|string|max:300', // older field name, still accepted
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($leave->status !== 'pending') {
            return response()->json([
                'message' => "This leave request was already {$leave->status}.",
            ], 422);
        }

        $leave->update([
            'status' => $request->status,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'admin_notes' => $request->input('admin_notes', $request->input('remarks')),
        ]);

        return response()->json([
            'message' => 'Leave request updated.',
            'data' => $leave->load(['employee', 'approvedBy:id,name']),
        ], 200);
    }

    // DELETE /api/leave-requests/{id}
    public function destroy($id)
    {
        $leave = LeaveRequest::find($id);

        if (! $leave) {
            return response()->json(['message' => 'Leave request not found.'], 404);
        }

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 403);
        }

        if ($leave->attachment_path) {
            Storage::disk('public')->delete($leave->attachment_path);
        }

        $leave->delete();

        return response()->json(['message' => 'Leave request cancelled.'], 200);
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

    // POST /api/my-leave-requests (multipart/form-data, optional attachment)
    public function myStore(Request $request)
    {
        $employee = $this->myEmployee($request);

        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this login.'], 404);
        }

        $validator = Validator::make($request->all(), [
            'leave_type' => 'required|in:'.self::SELF_SERVICE_TYPES,
            'is_half_day' => 'nullable|boolean',
            'start_date' => 'required|date|after_or_equal:today',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'required|string|max:500',
            'attachment' => 'nullable|file|mimes:png,jpg,jpeg,pdf|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors(),
            ], 422);
        }

        $half = $request->boolean('is_half_day');
        $start = $request->start_date;
        $end = $half ? $start : $request->end_date;

        // No overlapping pending or approved leave for the same employee
        $overlap = LeaveRequest::where('employee_id', $employee->id)
            ->whereIn('status', ['pending', 'approved'])
            ->where('start_date', '<=', $end)
            ->where('end_date', '>=', $start)
            ->exists();

        if ($overlap) {
            return response()->json([
                'message' => 'You already have a pending or approved leave on those dates.',
            ], 422);
        }

        $path = null;
        if ($request->hasFile('attachment')) {
            $path = $request->file('attachment')->store('leave-attachments', 'public');
        }

        $leave = LeaveRequest::create([
            'employee_id' => $employee->id,
            'leave_type' => $request->leave_type,
            'start_date' => $start,
            'end_date' => $end,
            'total_days' => $this->computeDays($start, $end, $half),
            'is_half_day' => $half,
            'reason' => $request->reason,
            'status' => 'pending',
            'attachment_path' => $path,
        ]);

        return response()->json([
            'message' => 'Leave request submitted.',
            'data' => $leave->load('approvedBy:id,name'),
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

        if ($leave->attachment_path) {
            Storage::disk('public')->delete($leave->attachment_path);
        }

        $leave->delete();

        return response()->json(['message' => 'Leave request cancelled.'], 200);
    }
}
