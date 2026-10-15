<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use App\Support\PayrollCalculator;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3: net pay is never negative. An employee with no days worked still owes
// the government contributions; the shortfall is carried to the next cut-off
// (CARRY_OVER, default) or paid by the employer (EMPLOYER_SHOULDERED).
class NegativeNetPayTest extends TestCase
{
    use RefreshDatabase;

    private const NOV23 = ['start' => '2026-11-23', 'end' => '2026-12-06', 'pay_day' => '2026-12-11'];

    private const DEC07 = ['start' => '2026-12-07', 'end' => '2026-12-20', 'pay_day' => '2026-12-25'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 28)->setTime(10, 0));
    }

    private function employee(): Employee
    {
        return Employee::create([
            'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Guard', 'daily_rate' => 700,
            'pay_basis' => 'daily', 'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day',
            'shift_start' => '09:00', 'shift_end' => '18:00', 'is_active' => true, 'employment_status' => 'regular', 'regularized_at' => '2026-01-05',
        ]);
    }

    private function payroll(Employee $e, array $period): Payroll
    {
        return Payroll::create(['employee_id' => $e->id, 'period_start' => $period['start'], 'period_end' => $period['end'], 'pay_day' => $period['pay_day'], 'status' => 'unpaid', 'prepared_by' => User::factory()->create(['role' => 'hr'])->id]
            + PayrollCalculator::compute($e, $period));
    }

    public function test_a_shortfall_is_carried_to_the_next_cut_off(): void
    {
        $e = $this->employee();
        $first = $this->payroll($e, self::NOV23); // no days worked
        $owed = (float) $first->sss_deduction + (float) $first->philhealth_deduction + (float) $first->pagibig_deduction;
        $this->assertGreaterThan(0, $owed);
        $this->assertEquals(0, (float) $first->net_pay);
        $this->assertEquals($owed, (float) $first->carry_over_out);
        $this->assertEquals(0, (float) $first->employer_shouldered);

        foreach (['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'] as $d) {
            Attendance::create(['employee_id' => $e->id, 'date' => $d, 'time_in' => '09:00:00', 'time_out' => '18:00:00', 'hours_worked' => 8, 'status' => 'present']);
        }
        $next = PayrollCalculator::compute($e, self::DEC07);
        $this->assertEquals($owed, $next['carry_over_in']);
        $gov = $next['sss_deduction'] + $next['philhealth_deduction'] + $next['pagibig_deduction'];
        $this->assertEqualsWithDelta($next['gross_pay'] - $gov - $next['tax_deduction'] - $owed, $next['net_pay'], 0.01);
    }

    public function test_the_employer_can_shoulder_the_shortfall(): void
    {
        Settings::set('payroll.negative_net_handling', 'EMPLOYER_SHOULDERED');
        $e = $this->employee();
        $first = $this->payroll($e, self::NOV23);
        $this->assertEquals(0, (float) $first->net_pay);
        $this->assertEquals(0, (float) $first->carry_over_out);
        $this->assertGreaterThan(0, (float) $first->employer_shouldered);
        $this->assertEquals(0, PayrollCalculator::compute($e, self::DEC07)['carry_over_in']);
    }

    public function test_payroll_notes_are_not_sent(): void
    {
        $e = $this->employee();
        $p = $this->payroll($e, self::NOV23);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson("/api/payrolls/{$p->id}/payslip")->assertOk()->assertJsonMissingPath('notes');
        $this->getJson('/api/payroll-records?date=2026-11-23')->assertOk()->assertJsonMissingPath('rows.0.payroll.notes');
    }
}
