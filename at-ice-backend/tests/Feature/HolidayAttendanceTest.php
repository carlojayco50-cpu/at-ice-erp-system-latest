<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureKioskToken;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\User;
use App\Support\PayrollCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3: on a holiday attendance is not affected: no absence, no lateness.
class HolidayAttendanceTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->employee = Employee::create([
            'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Guard', 'daily_rate' => 700,
            'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day', 'shift_start' => '09:00', 'shift_end' => '18:00',
            'is_active' => true, 'employment_status' => 'regular', 'regularized_at' => '2026-01-05',
        ]);
    }

    public function test_working_on_a_holiday_is_never_late(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 25)->setTime(10, 30)); // Christmas, 90 minutes after 09:00
        $face = FaceData::create(['worker_name' => 'Ana Reyes', 'role' => 'guard', 'employee_id' => $this->employee->id, 'descriptor' => array_fill(0, 128, 0.1)]);
        $this->withoutMiddleware(EnsureKioskToken::class);

        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in'])->assertCreated();
        $a = Attendance::first();
        $this->assertSame(0, $a->late_minutes);
        $this->assertSame('present', $a->status);

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/attendances?date=2026-12-25')->assertJsonPath('0.holiday.name', 'Christmas Day');
    }

    public function test_not_working_on_a_holiday_is_not_an_absence(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 12, 28)->setTime(10, 0));
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/attendances/roster?date=2026-12-25')
            ->assertOk()->assertJsonCount(0, 'not_in')->assertJsonPath('holiday.type', 'REGULAR');
        $this->getJson('/api/attendances/roster?date=2026-12-23')->assertJsonCount(1, 'not_in');

        // Dec 21-25 work days: no Time In at all; only Dec 21-24 are absences (Dec 24 is a special day too)
        $sheet = PayrollCalculator::timesheet($this->employee, CarbonImmutable::parse('2026-12-21'), CarbonImmutable::parse('2026-12-25'));
        $this->assertEquals(3, $sheet['absent_days']); // Dec 21, 22, 23 (24 and 25 are holidays)
    }
}
