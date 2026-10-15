<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Support\LeaveCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Review change request, phase 3: leave rules and credits (docs/REVIEW-DECISIONS.md).
class LeaveRulesTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        // Wednesday 2026-10-14, in the 2026-10-12 to 10-25 pay period
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 14)->setTime(10, 0));
        $user = User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']);
        $this->employee = Employee::create([
            'user_id' => $user->id, 'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Checker',
            'daily_rate' => 600, 'date_hired' => '2025-06-01', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true,
            'employment_status' => 'regular', 'regularized_at' => '2025-12-01',
        ]);
        Sanctum::actingAs($user);
    }

    private function file(array $data)
    {
        return $this->post('/api/my-leave-requests', $data + ['reason' => 'Family matter'], ['Accept' => 'application/json']);
    }

    private function medcert()
    {
        return UploadedFile::fake()->create('medcert.pdf', 100, 'application/pdf');
    }

    public function test_credits_are_half_a_day_per_cutoff_from_january_and_capped(): void
    {
        // Pay periods ending from Jan 1 to Oct 14, 2026: Jan 4 ... Oct 11 = 21 periods
        $this->assertSame(['year' => 2026, 'earned' => 10.5, 'used' => 0.0, 'available' => 10.5], LeaveCredits::for($this->employee));

        // Probationary: no credits
        $this->employee->update(['employment_status' => 'probationary']);
        $this->assertSame(0.0, LeaveCredits::for($this->employee->fresh())['earned']);

        // Regular since Oct 1: only the period ending Oct 11
        $this->employee->update(['employment_status' => 'regular', 'regularized_at' => '2026-10-01']);
        $this->assertSame(0.5, LeaveCredits::for($this->employee->fresh())['earned']);

        // A full year is 26 pay periods = 13 days (the 15-day cap is never reached at 0.5)
        $this->employee->update(['regularized_at' => '2024-01-01']);
        $this->assertSame(13.0, LeaveCredits::for($this->employee->fresh(), '2026-12-31')['earned']);
    }

    public function test_probationary_employees_cannot_file_leave(): void
    {
        $this->employee->update(['employment_status' => 'probationary']);
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-03', 'end_date' => '2026-11-03'])
            ->assertStatus(422)
            ->assertJsonPath('errors.leave_type.0', 'Leave cannot be filed while probationary. Absences during probation are unpaid.');
    }

    public function test_vacation_leave_needs_14_days_notice(): void
    {
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-10-27', 'end_date' => '2026-10-27'])->assertStatus(422);
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-10-28', 'end_date' => '2026-10-29'])->assertCreated();
    }

    public function test_sick_leave_is_for_past_days_within_the_window_with_a_med_cert_and_credits(): void
    {
        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-14', 'attachment' => $this->medcert()])
            ->assertStatus(422)->assertJsonPath('errors.start_date.0', 'Sick leave is filed after you return, for past dates only.');
        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-12', 'attachment' => $this->medcert()])
            ->assertStatus(422)->assertJsonPath('errors.start_date.0', 'Sick leave must be filed at most 1 day after you return.');
        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-13'])
            ->assertStatus(422)->assertJsonPath('errors.attachment.0', 'Attach your medical certificate.');

        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-13', 'end_date' => '2026-10-13', 'attachment' => $this->medcert()])->assertCreated();
        $leave = LeaveRequest::first();
        $this->assertSame('local', $leave->attachment_disk);
        Storage::disk('local')->assertExists($leave->attachment_path);
        $this->assertSame('pending', $leave->status); // never approved on its own

        // No credits: SL cannot be filed at all
        $this->employee->update(['regularized_at' => '2026-10-12']);
        LeaveRequest::query()->delete();
        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-13', 'attachment' => $this->medcert()])
            ->assertStatus(422)->assertJsonPath('errors.leave_type.0', 'Not enough leave credits for sick leave (0 day(s) left).');
    }

    public function test_emergency_leave_in_hours_is_paid_from_credits_then_unpaid(): void
    {
        $this->employee->update(['regularized_at' => '2026-10-01']); // 0.5 day of credit
        $this->file(['leave_type' => 'emergency', 'start_date' => '2026-10-14', 'hours' => 6])->assertCreated();
        $leave = LeaveRequest::first();
        $this->assertEquals(6, (float) $leave->hours);
        $this->assertEquals(0.75, (float) $leave->total_days);

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->putJson("/api/leave-requests/{$leave->id}/status", ['status' => 'approved'])->assertOk();
        $leave->refresh();
        $this->assertEquals(0.5, (float) $leave->paid_days);   // 4 hours paid from credits
        $this->assertEquals(0.25, (float) $leave->unpaid_days); // 2 hours unpaid
        $this->assertFalse($leave->is_paid);
        $this->assertSame(0.0, LeaveCredits::for($this->employee->fresh())['available']);
    }

    public function test_no_overlapping_requests(): void
    {
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-02', 'end_date' => '2026-11-04'])->assertCreated();
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-04', 'end_date' => '2026-11-05'])
            ->assertStatus(422)->assertJsonPath('errors.start_date.0', 'You already have a pending or approved leave on those dates.');
    }

    public function test_hr_rejects_with_a_reason_and_approves_with_optional_remarks(): void
    {
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-03', 'end_date' => '2026-11-03'])->assertCreated();
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-09', 'end_date' => '2026-11-09'])->assertCreated();
        [$a, $b] = LeaveRequest::orderBy('id')->get();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->putJson("/api/leave-requests/{$a->id}/status", ['status' => 'rejected'])
            ->assertStatus(422)->assertJsonPath('errors.reject_reason.0', 'Give the reason for rejecting this leave.');
        $this->putJson("/api/leave-requests/{$a->id}/status", ['status' => 'rejected', 'reject_reason' => 'Peak delivery week'])->assertOk();
        $this->putJson("/api/leave-requests/{$b->id}/status", ['status' => 'approved'])->assertOk();

        $this->assertSame('Peak delivery week', $a->fresh()->reject_reason);
        $this->assertTrue($b->fresh()->is_paid);
        $this->assertEquals(1, (float) $b->fresh()->paid_days);
        $this->assertSame(['leave.rejected', 'leave.approved'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
    }

    public function test_hr_can_mark_a_sick_leave_unpaid_and_only_hr_or_the_owner_opens_the_med_cert(): void
    {
        $this->file(['leave_type' => 'sick', 'start_date' => '2026-10-13', 'attachment' => $this->medcert()])->assertCreated();
        $leave = LeaveRequest::first();
        $this->get("/api/my-leave-requests/{$leave->id}/attachment")->assertOk();

        Sanctum::actingAs(User::factory()->create(['role' => 'employee', 'sub_role' => 'salesman']));
        $this->getJson("/api/leave-requests/{$leave->id}/attachment")->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->get("/api/leave-requests/{$leave->id}/attachment")->assertOk();
        $this->putJson("/api/leave-requests/{$leave->id}/status", ['status' => 'approved', 'is_paid' => false])->assertOk();
        $this->assertEquals(1, (float) $leave->fresh()->unpaid_days);
        $this->assertFalse($leave->fresh()->is_paid);
    }

    public function test_leave_on_a_holiday_is_blocked_and_holidays_inside_a_range_are_not_counted(): void
    {
        // Nov 30 (Bonifacio Day) is a regular holiday; today is Oct 14
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-30', 'end_date' => '2026-11-30'])
            ->assertStatus(422)->assertJsonPath('errors.start_date.0', 'Nov 30, 2026 is a holiday (Bonifacio Day). No leave is needed: you are not marked absent on a holiday.');
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-01', 'end_date' => '2026-11-02'])
            ->assertStatus(422)->assertJsonPath('errors.start_date.0', 'Every day in this range is a holiday. No leave is needed.');

        // Nov 29 to Dec 1: 3 days with the holiday in the middle = 2 leave days
        $this->file(['leave_type' => 'vacation', 'start_date' => '2026-11-29', 'end_date' => '2026-12-01'])->assertCreated();
        $this->assertEquals(2, (float) LeaveRequest::first()->total_days);
    }
}
