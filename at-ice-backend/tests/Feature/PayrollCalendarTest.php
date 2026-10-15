<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LiveEvent;
use App\Models\User;
use App\Support\PayrollCalendar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollCalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_periods_are_14_days_from_the_anchor_monday(): void
    {
        // 2026-01-05 + 14 * 20 = 2026-10-12
        $this->assertSame(['start' => '2026-10-12', 'end' => '2026-10-25', 'pay_day' => '2026-10-30'], PayrollCalendar::periodFor('2026-10-13'));
        $this->assertSame('2026-09-28', PayrollCalendar::periodFor('2026-10-11')['start']);
    }

    public function test_hr_gets_one_cutoff_notice_per_period_and_payroll_is_bi_weekly(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 25)->setTime(9, 0)); // cut-off day
        $hr = User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']);
        $emp = Employee::create(['employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Guard', 'daily_rate' => 500, 'date_hired' => '2026-01-01', 'is_active' => true]);
        Sanctum::actingAs($hr);

        $this->getJson('/api/live-feed')->assertOk();
        $this->getJson('/api/live-feed')->assertOk();
        $this->assertSame(1, LiveEvent::where('action', 'cutoff')->count());
        $this->assertStringContainsString('Oct 12 – Oct 25', LiveEvent::where('action', 'cutoff')->first()->message);
        $this->assertStringContainsString('1 employee', LiveEvent::where('action', 'cutoff')->first()->message);

        $periods = $this->getJson('/api/payroll-periods')->assertOk()->json();
        $this->assertSame('2026-10-12', $periods[0]['start']);
        $this->assertTrue($periods[0]['current']);
        $this->assertSame(1, $periods[0]['missing']);

        // The payroll is made from the approved timesheet, for the whole 14-day period.
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-20', 'employee_ids' => [$emp->id]])->assertOk();
        $this->assertSame(['2026-10-12', '2026-10-25'], [$emp->payrolls()->first()->period_start->toDateString(), $emp->payrolls()->first()->period_end->toDateString()]);
    }
}
