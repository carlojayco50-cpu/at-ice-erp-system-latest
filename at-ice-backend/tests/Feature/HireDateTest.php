<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureKioskToken;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3: a hire date may be up to 14 days ahead; until then the employee is left
// out of the kiosk, the roster and payroll.
class HireDateTest extends TestCase
{
    use RefreshDatabase;

    private function payload(string $hired, array $overrides = []): array
    {
        return $overrides + [
            'position' => 'Guard', 'first_name' => 'Ben', 'last_name' => 'Cruz', 'street' => 'Rizal St', 'barangay' => 'Muzon',
            'city' => 'San Jose Del Monte', 'province' => 'Bulacan', 'date_hired' => $hired, 'shift_start' => '09:00', 'shift_end' => '18:00',
            'employment_type' => 'regular', 'daily_rate' => 600,
        ];
    }

    public function test_today_plus_14_passes_and_plus_15_fails(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 15)->setTime(10, 0));
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload('2026-10-30'))
            ->assertStatus(422)->assertJsonPath('errors.date_hired.0', 'The hire date can be at most 14 days from today.');
        $this->postJson('/api/employees', $this->payload('2026-10-29'))->assertCreated();
        $this->postJson('/api/employees', $this->payload('2020-01-06', ['first_name' => 'Old']))->assertCreated(); // past dates are fine
    }

    public function test_a_future_hire_is_left_out_of_the_kiosk_roster_and_payroll(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 15)->setTime(10, 0));
        $future = Employee::create([
            'employee_id' => 'EMP-0001', 'first_name' => 'Fe', 'last_name' => 'Future', 'position' => 'Guard', 'daily_rate' => 600,
            'date_hired' => '2026-10-20', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true,
        ]);
        $face = FaceData::create(['worker_name' => 'Fe Future', 'role' => 'guard', 'employee_id' => $future->id, 'descriptor' => array_fill(0, 128, 0.1)]);

        $this->withoutMiddleware(EnsureKioskToken::class);
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in'])
            ->assertStatus(409)->assertJsonPath('type', 'not_started');
        $this->assertDatabaseCount('attendances', 0);

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/attendances/roster?date=2026-10-15')->assertOk()->assertJsonCount(0, 'not_in');
        // The pay period that ended Oct 11 does not include them
        $this->getJson('/api/timesheets?date=2026-10-05')->assertOk()->assertJsonCount(0, 'rows');
    }
}
