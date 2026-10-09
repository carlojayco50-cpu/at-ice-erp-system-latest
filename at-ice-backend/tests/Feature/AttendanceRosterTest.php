<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceRosterTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $no, string $first): Employee
    {
        return Employee::create([
            'employee_id' => $no, 'first_name' => $first, 'last_name' => 'Cruz',
            'position' => 'Guard', 'date_hired' => '2026-01-05', 'is_active' => true,
        ]);
    }

    public function test_roster_lists_who_has_not_timed_in_and_who_is_on_leave(): void
    {
        $today = now()->toDateString();
        $in = $this->employee('EMP-001', 'Ana');
        $out = $this->employee('EMP-002', 'Ben');
        $leave = $this->employee('EMP-003', 'Carl');
        $pendingLeave = $this->employee('EMP-004', 'Dina');

        Attendance::create(['employee_id' => $in->id, 'date' => $today, 'time_in' => '08:00:00', 'status' => 'present']);
        LeaveRequest::create(['employee_id' => $leave->id, 'leave_type' => 'sick', 'start_date' => $today, 'end_date' => $today, 'total_days' => 1, 'reason' => 'Fever', 'status' => 'approved']);
        LeaveRequest::create(['employee_id' => $pendingLeave->id, 'leave_type' => 'vacation', 'start_date' => $today, 'end_date' => $today, 'total_days' => 1, 'reason' => 'Trip', 'status' => 'pending']);

        Sanctum::actingAs(User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']));
        $data = $this->getJson('/api/attendances/roster')->assertOk()->json();

        $notIn = collect($data['not_in'])->pluck('id')->all();
        $onLeave = collect($data['on_leave'])->pluck('id')->all();

        $this->assertEqualsCanonicalizing([$out->id, $pendingLeave->id], $notIn);
        $this->assertSame([$leave->id], $onLeave);
        $this->assertSame('sick', $data['on_leave'][0]['leave_type']);
    }
}
