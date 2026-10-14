<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureKioskToken;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\PayMultiplier;
use App\Models\User;
use App\Support\PayrollCalculator;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3 holiday pay (client defaults in pay_multipliers). ₱700 a day = ₱87.50 an hour.
// Nov 30, 2026 (Bonifacio Day) is a regular holiday, in the Nov 23 - Dec 6 period;
// Dec 8 (Immaculate Conception) a special non-working day, in Dec 7 - 20.
class HolidayPayTest extends TestCase
{
    use RefreshDatabase;

    private const NOV23 = ['start' => '2026-11-23', 'end' => '2026-12-06', 'pay_day' => '2026-12-11'];

    private const DEC07 = ['start' => '2026-12-07', 'end' => '2026-12-20', 'pay_day' => '2026-12-25'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 28)->setTime(10, 0));
    }

    private function employee(array $overrides = []): Employee
    {
        return Employee::create($overrides + [
            'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Guard', 'daily_rate' => 700,
            'pay_basis' => 'daily', 'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day',
            'shift_start' => '09:00', 'shift_end' => '18:00', 'is_active' => true, 'employment_status' => 'regular', 'regularized_at' => '2026-01-05',
        ]);
    }

    private function worked(Employee $e, string $date, float $hours, int $otMinutes = 0, bool $otApproved = false): void
    {
        Attendance::create(['employee_id' => $e->id, 'date' => $date, 'time_in' => '09:00:00', 'time_out' => '17:00:00', 'hours_worked' => $hours,
            'status' => 'present', 'ot_minutes' => $otMinutes, 'ot_approved' => $otApproved]);
    }

    public function test_the_client_holiday_pay_cases(): void
    {
        $e = $this->employee();

        $this->worked($e, '2026-11-30', 8);
        $this->assertEquals(1400.00, PayrollCalculator::compute($e, self::NOV23)['holiday_pay']); // regular holiday, 8 h at 200%

        Attendance::query()->delete();
        $this->worked($e, '2026-11-30', 6);
        $this->assertEquals(1050.00, PayrollCalculator::compute($e, self::NOV23)['holiday_pay']); // only the 6 hours worked

        $this->worked($e, '2026-12-08', 8, 60, true);
        $p = PayrollCalculator::compute($e, self::DEC07);
        $this->assertEquals(910.00, $p['holiday_pay']);     // special holiday, 8 h at 130%
        $this->assertEquals(113.75, $p['holiday_ot_pay']);  // 1 h of overtime at 130%
        $this->assertEquals(0, $p['basic_pay']);            // the holiday is not basic pay
    }

    public function test_a_holiday_not_worked_is_unpaid_and_not_an_absence(): void
    {
        $e = $this->employee();
        $p = PayrollCalculator::compute($e, self::NOV23);
        $this->assertEquals(0.00, $p['holiday_pay']);
        // 10 work days, Nov 30 is a holiday: 9 absences
        $this->assertEquals(9, $p['absent_days']);
    }

    public function test_a_worked_day_longer_than_the_work_day_pays_8_hours_after_the_break(): void
    {
        $e = $this->employee();
        $this->worked($e, '2026-11-30', 9); // 09:00-18:00 in = 8 paid
        $this->assertEquals(1400.00, PayrollCalculator::compute($e, self::NOV23)['holiday_pay']);
    }

    public function test_monthly_rated_gets_only_the_premium_and_no_deduction_for_an_unworked_holiday(): void
    {
        $e = $this->employee(['pay_basis' => 'monthly', 'monthly_rate' => 15281, 'daily_rate' => 700]); // 15,281 / 21.83 = 700
        $this->worked($e, '2026-11-30', 8);
        $p = PayrollCalculator::compute($e, self::NOV23);
        $this->assertEquals(700.00, $p['holiday_pay']); // (200% - 100%) x 8 x 87.50

        Attendance::query()->delete();
        $this->assertEquals(0, PayrollCalculator::compute($e, self::NOV23)['absence_deduction'] - 9 * 700); // only the 9 real absences

        Settings::set('payroll.monthly_unworked_holiday_deduct', true);
        $this->assertEquals(10 * 700, PayrollCalculator::compute($e, self::NOV23)['absence_deduction']); // the holiday too
    }

    public function test_the_rates_come_from_the_table_and_a_new_rate_applies_from_its_date(): void
    {
        $e = $this->employee();
        $this->worked($e, '2026-11-30', 8);
        PayMultiplier::create(['key' => 'REGULAR_HOLIDAY_WORKED', 'value' => 2.5, 'effective_date' => '2026-12-01']);
        $this->assertEquals(1400.00, PayrollCalculator::compute($e, self::NOV23)['holiday_pay']); // Nov 30 is before the change

        PayMultiplier::create(['key' => 'REGULAR_HOLIDAY_WORKED', 'value' => 2.5, 'effective_date' => '2026-11-01']);
        $this->assertEquals(1750.00, PayrollCalculator::compute($e, self::NOV23)['holiday_pay']);
    }

    public function test_overtime_is_counted_at_time_out_and_paid_only_once_hr_approves_it(): void
    {
        $e = $this->employee();
        $face = FaceData::create(['worker_name' => 'Ana Reyes', 'role' => 'guard', 'employee_id' => $e->id, 'descriptor' => array_fill(0, 128, 0.1)]);
        $this->withoutMiddleware(EnsureKioskToken::class);

        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 15)->setTime(8, 58));
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in'])->assertCreated();
        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 15)->setTime(19, 30, 20));
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_out'])->assertOk();
        $this->assertSame(90, Attendance::first()->ot_minutes);

        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 28)->setTime(10, 0));
        $this->assertEquals(0, PayrollCalculator::compute($e, self::DEC07)['overtime_pay']); // not approved yet

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/timesheets?date=2026-12-15')->assertJsonPath('rows.0.ot_pending_minutes', 90);
        $this->postJson('/api/timesheets/approve', ['date' => '2026-12-15', 'employee_ids' => [$e->id], 'approve_ot_ids' => [$e->id]])->assertOk();
        $this->assertTrue(Attendance::first()->ot_approved);
        $this->assertEquals(131.25, (float) $e->payrolls()->first()->overtime_pay); // 1.5 h x 87.50 x 100% (client OT_ORDINARY)
    }
}
