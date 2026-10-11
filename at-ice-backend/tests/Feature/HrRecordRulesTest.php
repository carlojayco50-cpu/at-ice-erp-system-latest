<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
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

    public function test_a_payroll_edit_gets_the_same_checks_as_a_new_one(): void
    {
        $this->payroll('2026-09-01', '2026-09-15');
        $second = $this->payroll('2026-09-16', '2026-09-30');

        // Moved onto the first period: overlap
        $this->putJson("/api/payrolls/{$second->id}", ['period_start' => '2026-09-10'])
            ->assertUnprocessable()->assertJsonPath('errors.period_start.0', fn ($m) => str_contains($m, 'cannot overlap'));
        // More days than the period has
        $this->putJson("/api/payrolls/{$second->id}", ['days_worked' => 20])->assertUnprocessable()->assertJsonStructure(['errors' => ['days_worked']]);
        // Net pay no longer matches
        $this->putJson("/api/payrolls/{$second->id}", ['sss_deduction' => 100])->assertUnprocessable()->assertJsonStructure(['errors' => ['net_pay']]);
        // A consistent change is saved
        $this->putJson("/api/payrolls/{$second->id}", ['sss_deduction' => 100, 'net_pay' => 2400])->assertOk();
    }

    public function test_payroll_status_only_moves_forward_and_paid_is_final(): void
    {
        $payroll = $this->payroll('2026-09-01', '2026-09-15', 'approved');

        $this->putJson("/api/payrolls/{$payroll->id}", ['status' => 'pending'])->assertUnprocessable();
        $this->putJson("/api/payrolls/{$payroll->id}", ['status' => 'paid'])->assertOk();
        $this->assertNotNull($payroll->fresh()->paid_at);

        $this->putJson("/api/payrolls/{$payroll->id}", ['notes' => 'changed'])->assertUnprocessable();
        $this->deleteJson("/api/payrolls/{$payroll->id}")->assertUnprocessable();
        $this->assertDatabaseHas('payrolls', ['id' => $payroll->id, 'status' => 'paid']);
    }

    public function test_an_attendance_correction_is_checked_and_hours_are_worked_out(): void
    {
        $day = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-01', 'time_in' => '08:00:00', 'status' => 'present']);
        $night = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-02', 'time_in' => '22:00:00', 'status' => 'present']);

        $this->putJson("/api/attendances/{$day->id}", ['time_out' => 'later'])->assertUnprocessable();
        $this->putJson("/api/attendances/{$day->id}", ['status' => 'sleeping'])->assertUnprocessable();

        // hours_worked sent by the client is ignored
        $this->putJson("/api/attendances/{$day->id}", ['time_out' => '17:30', 'hours_worked' => 99])->assertOk();
        $this->assertEquals(9.5, (float) $day->fresh()->hours_worked);
        $this->assertSame('17:30:00', $day->fresh()->time_out);

        // Time Out after midnight
        $this->putJson("/api/attendances/{$night->id}", ['time_out' => '06:00'])->assertOk();
        $this->assertEquals(8.0, (float) $night->fresh()->hours_worked);
    }

    public function test_hr_leave_checks_overlap_and_allows_a_past_date(): void
    {
        LeaveRequest::create(['employee_id' => $this->employee->id, 'leave_type' => 'sick', 'start_date' => '2026-10-05', 'end_date' => '2026-10-06', 'total_days' => 2, 'reason' => 'Fever', 'status' => 'approved']);
        $leave = fn ($start, $end) => $this->postJson('/api/leave-requests', [
            'employee_id' => $this->employee->id, 'leave_type' => 'sick', 'start_date' => $start, 'end_date' => $end, 'reason' => 'Paper sick leave',
        ]);

        $leave('2026-10-06', '2026-10-07')->assertUnprocessable();
        $leave(now()->subDays(3)->toDateString(), now()->subDays(2)->toDateString())->assertCreated();
    }
}
