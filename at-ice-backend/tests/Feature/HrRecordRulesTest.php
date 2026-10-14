<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HrRecordRulesTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;

    private User $hr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->employee = Employee::create([
            'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Cruz',
            'position' => 'Guard', 'date_hired' => '2026-01-05', 'is_active' => true,
        ]);
        $this->hr = User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']);
        Sanctum::actingAs($this->hr);
    }

    private function payroll(string $start, string $end, string $status = 'pending'): Payroll
    {
        return Payroll::create([
            'employee_id' => $this->employee->id, 'period_start' => $start, 'period_end' => $end,
            'days_worked' => 5, 'daily_rate' => 500, 'gross_pay' => 2500, 'net_pay' => 2500, 'status' => $status, 'prepared_by' => $this->hr->id,
        ]);
    }

    public function test_attendance_times_cannot_be_edited_only_a_note(): void
    {
        $day = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-01', 'time_in' => '08:00:00', 'status' => 'present']);

        foreach ([['time_out' => '17:30'], ['status' => 'absent'], ['hours_worked' => 9], ['late_minutes' => 0]] as $edit) {
            $this->putJson("/api/attendances/{$day->id}", $edit + ['notes' => 'x'])->assertUnprocessable();
        }
        $this->assertNull($day->fresh()->time_out);

        $this->putJson("/api/attendances/{$day->id}", ['notes' => 'Forgot to time out; confirmed by supervisor'])->assertOk();
        $this->assertSame('Forgot to time out; confirmed by supervisor', $day->fresh()->notes);
    }

    public function test_hr_cannot_file_leave_for_an_employee(): void
    {
        $this->postJson('/api/leave-requests', [
            'employee_id' => $this->employee->id, 'leave_type' => 'sick', 'start_date' => '2026-10-05', 'end_date' => '2026-10-05', 'reason' => 'Paper sick leave',
        ])->assertStatus(405);
    }
}
