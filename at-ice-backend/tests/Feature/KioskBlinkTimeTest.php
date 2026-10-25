<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureKioskToken;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Time in and out are recorded at the moment of the blink (owner,
// 2026-10-22): the kiosk sends how long ago the blink finished and the server
// takes that (at most 5 seconds) off its own clock, so the face checks and the
// network never make anyone late.
class KioskBlinkTimeTest extends TestCase
{
    use RefreshDatabase;

    private function guard(): FaceData
    {
        $emp = Employee::create([
            'employee_id' => 'EMP-0001', 'first_name' => 'Gina', 'last_name' => 'Guard', 'position' => 'Guard',
            'daily_rate' => 600, 'date_hired' => '2026-01-05', 'employment_type' => 'regular',
            'shift' => 'day', 'shift_start' => '09:00', 'shift_end' => '18:00', 'is_active' => true,
        ]);

        return FaceData::create(['worker_name' => 'Gina Guard', 'role' => 'guard', 'employee_id' => $emp->id, 'descriptor' => array_fill(0, 128, 0.1)]);
    }

    public function test_the_time_of_the_blink_is_recorded_so_a_slow_check_never_makes_anyone_late(): void
    {
        $face = $this->guard();
        $this->withoutMiddleware(EnsureKioskToken::class);

        // Blinked at 09:00:58; the request arrives at 09:01:00.5
        $this->travelTo(now(config('atice.timezone'))->setDate(2026, 10, 15)->setTime(9, 1, 0, 500000));
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in', 'elapsed_ms' => 2500])
            ->assertCreated()->assertJsonPath('type', 'time_in');

        $a = Attendance::first();
        $this->assertSame('09:00:58', substr((string) $a->time_in, 0, 8));
        $this->assertSame(0, (int) $a->late_minutes);
    }

    public function test_at_most_five_seconds_are_taken_off(): void
    {
        $face = $this->guard();
        $this->withoutMiddleware(EnsureKioskToken::class);

        $this->travelTo(now(config('atice.timezone'))->setDate(2026, 10, 15)->setTime(9, 2, 0));
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in', 'elapsed_ms' => 120000])->assertCreated();

        $this->assertSame('09:01:55', substr((string) Attendance::first()->time_in, 0, 8));
        $this->assertSame(1, (int) Attendance::first()->late_minutes);

        // a negative delay is refused
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in', 'elapsed_ms' => -5])
            ->assertStatus(422);
    }
}
