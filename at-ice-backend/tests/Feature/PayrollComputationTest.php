<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Payroll;
use App\Models\User;
use App\Support\PayPeriod;
use App\Support\PayrollCalculator;
use App\Support\Settings;
use App\Support\ThirteenthMonth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Review change request, phase 4: payroll computation (docs/REVIEW-DECISIONS.md).
// October 2026 has three pay days: Oct 2, Oct 16 and Oct 30.
class PayrollComputationTest extends TestCase
{
    use RefreshDatabase;

    private const SEP28 = ['start' => '2026-09-28', 'end' => '2026-10-11', 'pay_day' => '2026-10-16']; // 2nd pay day of Oct

    private const OCT12 = ['start' => '2026-10-12', 'end' => '2026-10-25', 'pay_day' => '2026-10-30']; // 3rd pay day of Oct

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 28)->setTime(10, 0));
    }

    private function employee(array $overrides = []): Employee
    {
        static $n = 0;
        $n++;

        return Employee::create($overrides + [
            'employee_id' => sprintf('EMP-%04d', $n), 'first_name' => 'Test', 'last_name' => "Worker{$n}", 'position' => 'Checker',
            'daily_rate' => 600, 'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true,
            'employment_status' => 'regular', 'regularized_at' => '2026-01-05', 'pay_basis' => 'daily',
        ]);
    }

    private function monthly(float $rate, array $overrides = []): Employee
    {
        return $this->employee($overrides + ['pay_basis' => 'monthly', 'monthly_rate' => $rate, 'daily_rate' => round($rate / 21.83, 2)]);
    }

    private function day(Employee $e, string $date, float $hours = 8, int $late = 0): void
    {
        Attendance::create([
            'employee_id' => $e->id, 'date' => $date, 'time_in' => $late ? sprintf('09:%02d:00', $late) : '08:55:00',
            'time_out' => '18:00:00', 'hours_worked' => $hours, 'late_minutes' => $late, 'status' => $late ? 'late' : 'present',
        ]);
    }

    public function test_government_deduction_strategies_in_a_month_with_three_pay_days(): void
    {
        $this->assertSame(['2026-10-02', '2026-10-16', '2026-10-30'], PayPeriod::payDaysInMonth(2026, 10));

        // SPLIT_FIRST_TWO (the owner's choice): half, half, nothing
        $this->assertSame([0.5, 0.5, 0.0], array_map(fn ($d) => PayrollCalculator::governmentShare($d), PayPeriod::payDaysInMonth(2026, 10)));
        // FIRST_PAYROLL_OF_MONTH: all on the first
        Settings::set('payroll.gov_deduction_strategy', 'FIRST_PAYROLL_OF_MONTH');
        $this->assertSame([1.0, 0.0, 0.0], array_map(fn ($d) => PayrollCalculator::governmentShare($d), PayPeriod::payDaysInMonth(2026, 10)));
    }

    public function test_government_shares_for_a_16000_monthly_employee(): void
    {
        // Monthly: SSS 5% of 16,000 = 800; PhilHealth 2.5% = 400; Pag-IBIG 2% capped at 200
        $g = PayrollCalculator::government(16000, '2026-10-16'); // 2nd pay day: half
        $this->assertEqualsWithDelta([400, 200, 100], [$g['sss'], $g['philhealth'], $g['pagibig']], 0.001);
        $g = PayrollCalculator::government(16000, '2026-10-30'); // 3rd pay day: none
        $this->assertEqualsWithDelta([0, 0, 0], [$g['sss'], $g['philhealth'], $g['pagibig']], 0.001);
    }

    public function test_daily_rated_pay_with_late_and_a_half_day(): void
    {
        $e = $this->employee(['employment_status' => 'probationary', 'regularized_at' => null]);
        $this->day($e, '2026-10-12', 8, 15); // 15 minutes late
        $this->day($e, '2026-10-13');
        $this->day($e, '2026-10-14', 3.5);   // half day
        $p = PayrollCalculator::compute($e, self::OCT12);

        $this->assertEquals(2.5, $p['days_present']);
        $this->assertEquals(7, $p['absent_days']); // probationary absences are simply unpaid
        $this->assertEquals(1500, $p['basic_pay']);
        $this->assertEquals(18.75, $p['late_deduction']); // 15 x (75 / 60)
        $this->assertEquals(0, $p['absence_deduction']);
        $this->assertEquals(1481.25, $p['gross_pay']);
        $this->assertEquals(0, $p['sss_deduction']); // 3rd pay day
        $this->assertEquals(0, $p['tax_deduction']); // zero-tax employee
        $this->assertEquals(1481.25, $p['net_pay']);
    }

    public function test_monthly_rated_with_absence_unpaid_sick_leave_emergency_hours_and_late(): void
    {
        $e = $this->monthly(16000);
        foreach (['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-08'] as $d) {
            $this->day($e, $d);
        }
        $this->day($e, '2026-10-06', 8, 10); // 10 minutes late
        LeaveRequest::create(['employee_id' => $e->id, 'leave_type' => 'sick', 'start_date' => '2026-10-07', 'end_date' => '2026-10-07', 'total_days' => 1, 'reason' => 'Flu',
            'status' => 'approved', 'is_paid' => false, 'paid_days' => 0, 'unpaid_days' => 1]);
        LeaveRequest::create(['employee_id' => $e->id, 'leave_type' => 'emergency', 'start_date' => '2026-10-08', 'end_date' => '2026-10-08', 'total_days' => 0.5, 'hours' => 4,
            'reason' => 'Family', 'status' => 'approved', 'is_paid' => false, 'paid_days' => 0, 'unpaid_days' => 0.5]);
        // Oct 9: absent

        $p = PayrollCalculator::compute($e, self::SEP28);
        $this->assertEquals(732.94, $p['daily_rate']);
        $this->assertEquals(91.62, $p['hourly_rate']);
        $this->assertEquals(1, $p['absent_days']);
        $this->assertEquals(1, $p['unpaid_leave_days']);
        $this->assertEquals(4, $p['unpaid_leave_hours']);
        $this->assertEquals(7384.62, $p['basic_pay']);          // 16,000 x 12 / 26
        $this->assertEquals(732.94, $p['absence_deduction']);
        $this->assertEquals(1099.42, $p['leave_deduction']);    // 732.94 + 4 x 91.62
        $this->assertEquals(15.27, $p['late_deduction']);       // 10 x 91.62 / 60
        $this->assertEquals(5536.99, $p['gross_pay']);
        $this->assertEquals([400, 200, 100], [(float) $p['sss_deduction'], (float) $p['philhealth_deduction'], (float) $p['pagibig_deduction']]);
        $this->assertEquals(0, $p['tax_deduction']);
        $this->assertEquals(4836.99, $p['net_pay']);
    }

    public function test_a_mid_period_hire_is_paid_from_the_hire_date(): void
    {
        $e = $this->monthly(16000, ['date_hired' => '2026-10-14']);
        foreach (['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'] as $d) {
            $this->day($e, $d);
        }
        $p = PayrollCalculator::compute($e, self::OCT12);
        $this->assertEquals(0, $p['absent_days']); // the days before the hire are not absences
        $this->assertEquals(5863.52, $p['basic_pay']); // 8 work days x 732.94
        $this->assertEquals(5863.52, $p['net_pay']);
    }

    public function test_withholding_tax_for_a_high_earner(): void
    {
        $e = $this->monthly(100000, ['daily_rate' => 4580.85]);
        foreach (['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'] as $d) {
            $this->day($e, $d);
        }
        $p = PayrollCalculator::compute($e, self::SEP28);
        $this->assertEquals(46153.85, $p['gross_pay']);
        // SSS 5% of 35,000 (ceiling) = 1,750; PhilHealth 2.5% of 100,000 = 2,500; Pag-IBIG 200; half each
        $this->assertEquals([875, 1250, 100], [(float) $p['sss_deduction'], (float) $p['philhealth_deduction'], (float) $p['pagibig_deduction']]);
        // (46,153.85 - 2,225) x 26 = 1,142,150 a year: 102,500 + 25% over 800,000 = 188,037.50 / 26
        $this->assertEquals(7232.21, $p['tax_deduction']);
        $this->assertEquals(36696.63, $p['net_pay']);
    }

    public function test_hr_approves_timesheets_and_admin_pays_with_adjustments(): void
    {
        $e = $this->employee();
        $this->day($e, '2026-10-12');
        $hr = User::factory()->create(['role' => 'hr']);
        $admin = User::factory()->create(['role' => 'admin']);

        Sanctum::actingAs($hr);
        $sheet = $this->getJson('/api/timesheets?date=2026-10-14')->assertOk();
        $this->assertSame('not_approved', $sheet->json('rows.0.status'));
        $this->assertArrayNotHasKey('net_pay', $sheet->json('rows.0')); // HR sees no pay
        $this->postJson('/api/timesheets/approve', ['date' => '2026-11-02', 'employee_ids' => [$e->id]])->assertUnprocessable(); // period not over
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-14', 'employee_ids' => [$e->id]])->assertOk();
        $this->getJson('/api/payroll-records?date=2026-10-14')->assertOk(); // HR processes payroll

        $payroll = Payroll::first();
        $this->assertSame('unpaid', $payroll->status);
        $this->assertEquals(600, (float) $payroll->net_pay);

        Sanctum::actingAs($admin);
        $this->getJson('/api/payroll-records?date=2026-10-14')->assertOk()->assertJsonPath('rows.0.payroll.status', 'unpaid');
        $this->postJson("/api/payrolls/{$payroll->id}/adjustments", ['label' => 'Referral bonus', 'amount' => 500, 'taxable' => false])->assertCreated();
        $this->assertEquals(1100, (float) $payroll->fresh()->net_pay);

        $this->postJson('/api/payrolls/mark-paid', ['ids' => [$payroll->id]])->assertOk();
        $this->assertSame('paid', $payroll->fresh()->status);
        $this->postJson("/api/payrolls/{$payroll->id}/adjustments", ['label' => 'Late bonus', 'amount' => 1, 'taxable' => true])->assertUnprocessable();

        // Paid is final: approving the timesheet again leaves it alone
        Sanctum::actingAs($hr);
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-14', 'employee_ids' => [$e->id]])->assertOk()->assertJsonPath('skipped.0', $e->employee_id);
        $this->assertSame(['timesheet.approved', 'payroll.adjustment_added', 'payroll.paid'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
        $this->getJson('/api/payrolls')->assertOk()->assertJsonMissingPath('0.net_pay');
    }

    public function test_thirteenth_month_reviewer_case_and_from_payrolls(): void
    {
        // Hired in June at 16,000: 96,000 basic for 6 months, 26 unpaid hours at 91.62
        $this->assertSame(7801.49, ThirteenthMonth::formula(96000, 26 * 91.62));

        $e = $this->monthly(16000, ['date_hired' => '2026-06-01']);
        $hr = User::factory()->create(['role' => 'hr']);
        foreach (['2026-06-14' => [8000, 2382.12], '2026-06-28' => [88000, 0]] as $end => [$basic, $deduction]) {
            Payroll::create(['employee_id' => $e->id, 'period_start' => $end, 'period_end' => $end, 'basic_pay' => $basic, 'leave_deduction' => $deduction, 'status' => 'paid', 'prepared_by' => $hr->id]);
        }
        $this->assertSame(['basic' => 96000.0, 'deductions' => 2382.12, 'amount' => 7801.49, 'periods' => 2], ThirteenthMonth::for($e, 2026));
    }

    public function test_admin_removes_an_unpaid_adjustment_and_net_pay_follows(): void
    {
        $e = $this->employee();
        $this->day($e, '2026-10-12');
        $hr = User::factory()->create(['role' => 'hr']);
        $admin = User::factory()->create(['role' => 'admin']);

        Sanctum::actingAs($hr);
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-14', 'employee_ids' => [$e->id]])->assertOk();
        $payroll = Payroll::first();

        Sanctum::actingAs($admin);
        $adjustment = $this->postJson("/api/payrolls/{$payroll->id}/adjustments", ['label' => 'Referral bonus', 'amount' => 500, 'taxable' => false])
            ->assertCreated()->json('adjustments.0.id');
        $this->assertEquals(1100, (float) $payroll->fresh()->net_pay);

        $this->deleteJson("/api/payroll-adjustments/{$adjustment}")->assertOk();
        $this->assertDatabaseMissing('payroll_adjustments', ['id' => $adjustment]);
        $this->assertEquals(600, (float) $payroll->fresh()->net_pay);
    }

    public function test_an_adjustment_cannot_be_removed_once_the_payroll_is_paid(): void
    {
        $e = $this->employee();
        $this->day($e, '2026-10-12');
        $hr = User::factory()->create(['role' => 'hr']);
        $admin = User::factory()->create(['role' => 'admin']);

        Sanctum::actingAs($hr);
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-14', 'employee_ids' => [$e->id]])->assertOk();
        $payroll = Payroll::first();

        Sanctum::actingAs($admin);
        $adjustment = $this->postJson("/api/payrolls/{$payroll->id}/adjustments", ['label' => 'Referral bonus', 'amount' => 500, 'taxable' => false])
            ->assertCreated()->json('adjustments.0.id');
        $this->postJson('/api/payrolls/mark-paid', ['ids' => [$payroll->id]])->assertOk();

        $this->deleteJson("/api/payroll-adjustments/{$adjustment}")->assertUnprocessable();
        $this->assertDatabaseHas('payroll_adjustments', ['id' => $adjustment]);
    }
}
