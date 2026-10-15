<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Review change request, phase 6: the demo data, a payroll stress test over a
// month with three pay days, and the retention review.
class PayrollStressAndRetentionTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_data_through_timesheets_and_payroll_in_a_three_pay_day_month(): void
    {
        // Nov 2, 2026: the period before is Oct 12-25, paid Oct 30 (3rd pay day of October)
        $this->travelTo(now('Asia/Manila')->setDate(2026, 11, 2)->setTime(9, 0));
        $this->seed(DemoSeeder::class);
        $this->assertSame(4, Employee::where('is_active', true)->count());
        $this->assertSame(1, Employee::where('is_active', false)->count());

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $sheet = collect($this->getJson('/api/timesheets?date=2026-10-20')->assertOk()->json('rows'))->keyBy('employee_id');
        $this->assertSame(4, $sheet->count()); // the inactive one is not on the payroll
        $this->assertEquals(9.5, $sheet['EMP-9001']['days_present']);
        $this->assertSame(17, $sheet['EMP-9001']['late_minutes']); // 09:17:30 = 17 minutes
        $this->assertEquals(1, $sheet['EMP-9002']['absent_days']);
        $this->assertEquals(1, $sheet['EMP-9002']['unpaid_leave_days']);
        $this->assertEquals(4, $sheet['EMP-9002']['unpaid_leave_hours']);
        $this->assertEquals(2, $sheet['EMP-9003']['absent_days']);
        $this->assertEquals(0, $sheet['EMP-9004']['absent_days']); // days before the hire do not count

        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-20', 'employee_ids' => $sheet->pluck('id')->all()])->assertOk()->assertJsonPath('approved', 4);

        foreach (Payroll::with('employee')->get() as $p) {
            $this->assertSame('2026-10-30', $p->pay_day->toDateString());
            // 3rd pay day of the month: no SSS, PhilHealth or Pag-IBIG (SPLIT_FIRST_TWO)
            $this->assertEquals(0, (float) $p->sss_deduction + (float) $p->philhealth_deduction + (float) $p->pagibig_deduction, $p->employee->employee_id);
            $this->assertGreaterThan(0, (float) $p->net_pay);
            $this->assertLessThanOrEqual((float) $p->gross_pay, (float) $p->net_pay);
            $this->assertEquals(0, (float) $p->tax_deduction); // all under 250,000 a year
        }
        $by = Payroll::with('employee')->get()->keyBy(fn ($p) => $p->employee->employee_id);
        $this->assertEquals(5795, (float) $by['EMP-9001']->basic_pay);          // 9.5 x 610
        $this->assertEquals(21.60, (float) $by['EMP-9001']->late_deduction);    // 17 x 76.25 / 60
        $this->assertEquals(7384.62, (float) $by['EMP-9002']->basic_pay);       // 16,000 x 12 / 26
        $this->assertEquals(1099.42, (float) $by['EMP-9002']->leave_deduction); // 732.94 + 4 x 91.62
        $this->assertEquals(732.94, (float) $by['EMP-9002']->absence_deduction);
        $this->assertEquals(4800, (float) $by['EMP-9003']->basic_pay);          // 8 days x 600; 2 absences unpaid
        $this->assertEquals(5130.58, (float) $by['EMP-9004']->basic_pay);       // 7 work days from the hire x 732.94
    }

    public function test_retention_review_keeps_or_deletes_only_when_admin_chooses(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 14)->setTime(9, 0));
        $old = Employee::create([
            'employee_id' => 'EMP-0100', 'first_name' => 'Old', 'last_name' => 'Timer', 'position' => 'Guard', 'daily_rate' => 500, 'date_hired' => '2020-01-06',
            'employment_type' => 'regular', 'shift' => 'day', 'is_active' => false, 'deactivated_at' => '2024-01-10',
        ]);
        $recent = Employee::create([
            'employee_id' => 'EMP-0101', 'first_name' => 'New', 'last_name' => 'Leaver', 'position' => 'Guard', 'daily_rate' => 500, 'date_hired' => '2025-01-06',
            'employment_type' => 'regular', 'shift' => 'day', 'is_active' => false, 'deactivated_at' => '2026-05-01',
        ]);
        Attendance::create(['employee_id' => $old->id, 'date' => '2023-03-01', 'time_in' => '08:55:00', 'status' => 'present']);
        Attendance::create(['employee_id' => $recent->id, 'date' => '2026-03-01', 'time_in' => '08:55:00', 'status' => 'present']);

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/retention-review')->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $review = $this->getJson('/api/retention-review')->assertOk();
        $this->assertSame(['EMP-0100'], array_column($review->json('employees'), 'employee_id')); // inactive over 2 years only
        $this->assertSame([2023], array_column($review->json('attendance_years'), 'year'));

        // Keep hides it for another period; nothing is deleted
        $this->postJson('/api/retention-review/keep', ['kind' => 'employee', 'ref' => $old->id])->assertOk();
        $this->assertSame([], $this->getJson('/api/retention-review')->json('employees'));
        $this->assertNotNull($old->fresh());

        // Delete an old attendance year; the current one cannot be
        $this->postJson('/api/retention-review/delete', ['kind' => 'attendance_year', 'ref' => 2026])->assertStatus(422);
        $this->postJson('/api/retention-review/delete', ['kind' => 'attendance_year', 'ref' => 2023])->assertOk();
        $this->assertSame(1, Attendance::count());

        $this->postJson('/api/retention-review/delete', ['kind' => 'employee', 'ref' => $old->id])->assertOk();
        $this->assertNull(Employee::find($old->id));
        $this->assertSame(['retention.kept', 'retention.deleted', 'retention.deleted'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
    }
}
