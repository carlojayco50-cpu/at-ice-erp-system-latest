<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\KioskDevice;
use App\Models\KioskSetting;
use App\Models\User;
use App\Support\Lateness;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Review change request, phase 2: employees, attendance, kiosk.
class EmployeeAttendanceKioskTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE = 'kiosk-0123456789abcdef';

    private function employee(array $overrides = []): Employee
    {
        return Employee::create($overrides + [
            'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Checker',
            'daily_rate' => 600, 'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true,
        ]);
    }

    public function test_late_minutes_are_whole_minutes_from_the_shift_start(): void
    {
        $this->assertSame(0, Lateness::minutes('09:00', '08:59:59', 0));
        $this->assertSame(0, Lateness::minutes('09:00', '09:00:00', 0));
        $this->assertSame(0, Lateness::minutes('09:00', '09:00:59', 0));
        $this->assertSame(1, Lateness::minutes('09:00', '09:01:00', 0));
        $this->assertSame(75, Lateness::minutes('09:00', '10:15:30', 0));
        // Within the grace period it is not late; past it, all minutes count.
        $this->assertSame(0, Lateness::minutes('09:00', '09:05:59', 5));
        $this->assertSame(6, Lateness::minutes('09:00', '09:06:00', 5));
        // Overnight shift starting 22:00
        $this->assertSame(0, Lateness::minutes('22:00', '21:50:00', 0));
        $this->assertSame(10, Lateness::minutes('22:00', '22:10:30', 0));
        $this->assertSame(150, Lateness::minutes('22:00', '00:30:00', 0));
        // Shift starting just after midnight, arriving before it
        $this->assertSame(0, Lateness::minutes('00:30', '23:55:00', 0));
        $this->assertSame('night', Lateness::label('21:00', '06:00'));
        $this->assertSame('day', Lateness::label('09:00', '18:00'));
    }

    public function test_the_shift_start_is_the_employees_own_or_the_default(): void
    {
        $this->assertSame('09:00', Lateness::shiftStart($this->employee()));
        $this->assertSame('08:00', Lateness::shiftStart(new Employee(['shift' => 'day', 'shift_start' => '08:00:00'])));
        $this->assertSame('21:00', Lateness::shiftStart(new Employee(['shift' => 'night'])));
    }

    public function test_deactivate_keeps_the_record_and_reactivate_brings_it_back(): void
    {
        $hr = User::factory()->create(['role' => 'hr']);
        Sanctum::actingAs($hr);
        $user = User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']);
        $emp = $this->employee(['user_id' => $user->id]);

        $this->deleteJson("/api/employees/{$emp->id}")->assertOk();
        $emp->refresh();
        $this->assertFalse($emp->is_active);
        $this->assertSame($hr->id, $emp->deactivated_by);
        $this->assertNotNull($emp->deactivated_at);
        $this->assertFalse($user->fresh()->is_active);

        $this->getJson('/api/employees')->assertJsonCount(0);
        $this->getJson('/api/employees?status=inactive')->assertJsonCount(1)->assertJsonPath('0.employee_id', 'EMP-0001')->assertJsonPath('0.status', 'inactive');

        $this->postJson("/api/employees/{$emp->id}/reactivate")->assertOk();
        $this->assertTrue($emp->fresh()->is_active);
        $this->assertSame('EMP-0001', $emp->fresh()->employee_id);
        $this->assertTrue($user->fresh()->is_active);

        $this->assertSame(['employee.deactivated', 'employee.reactivated'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
    }

    public function test_monthly_rated_and_probationary_employees(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->postJson('/api/employees', [
            'position' => 'Guard', 'first_name' => 'Ben', 'last_name' => 'Cruz', 'street' => 'Rizal St', 'barangay' => 'Muzon',
            'city' => 'San Jose Del Monte', 'province' => 'Bulacan', 'date_hired' => now()->subDay()->toDateString(), 'shift' => 'day',
            'employment_type' => 'regular', 'pay_basis' => 'monthly', 'monthly_rate' => 16000, 'shift_start' => '08:00', 'shift_end' => '17:00',
        ])->assertCreated();

        $e = Employee::first();
        $this->assertSame('monthly', $e->pay_basis);
        $this->assertEquals(732.94, (float) $e->daily_rate);
        $this->assertSame('probationary', $e->employment_status);
        $this->assertNull($e->regularized_at);

        $this->putJson("/api/employees/{$e->id}", ['employment_status' => 'regular', 'street' => 'Rizal St', 'barangay' => 'Muzon', 'city' => 'San Jose Del Monte', 'province' => 'Bulacan'])->assertOk();
        $this->assertSame(now()->toDateString(), $e->fresh()->regularized_at->toDateString());
        $this->assertSame('employee.regularized', DB::table('audit_logs')->value('action'));
    }

    public function test_five_wrong_pins_lock_only_that_kiosk_until_admin_overrides_it(): void
    {
        KioskSetting::current()->setPin('1234', null);
        KioskSetting::current()->setAdminPin('9876');
        $unlock = fn ($pin, $device = self::DEVICE) => $this->postJson('/api/kiosk/unlock', ['device_id' => $device, 'pin' => $pin]);

        for ($i = 1; $i <= 4; $i++) {
            $unlock('0000')->assertStatus(422)->assertJsonPath('attempts_remaining', 5 - $i);
        }
        $unlock('0000')->assertStatus(423)->assertJsonPath('code', 'kiosk_locked');

        // Locked with no time limit, even with the right PIN, hours later.
        $this->travel(3)->days();
        $unlock('1234')->assertStatus(423);
        // Another kiosk still works.
        $unlock('1234', 'kiosk-other-device-0001')->assertOk();

        // HR cannot unlock it (the old clear-lockout route is gone).
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->postJson('/api/hr/kiosk-pin/clear-lockout', ['current_password' => 'password'])->assertNotFound();

        $this->postJson('/api/kiosk/override', ['device_id' => self::DEVICE, 'admin_pin' => '1111'])->assertStatus(422);
        $this->postJson('/api/kiosk/override', ['device_id' => self::DEVICE, 'admin_pin' => '9876'])->assertOk();
        $unlock('1234')->assertOk()->assertJsonStructure(['token']);

        $device = KioskDevice::where('device_id', self::DEVICE)->first();
        $this->assertSame(
            ['wrong_pin', 'wrong_pin', 'wrong_pin', 'wrong_pin', 'wrong_pin', 'locked', 'blocked', 'override_wrong', 'override_ok', 'unlocked'],
            DB::table('kiosk_attempts')->where('kiosk_device_id', $device->id)->orderBy('id')->pluck('result')->all()
        );
        $this->assertSame(['kiosk.locked', 'kiosk.override_failed', 'kiosk.override'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
    }

    public function test_only_admin_sets_the_override_pin(): void
    {
        $hr = User::factory()->create(['role' => 'hr', 'password' => 'Secret-123!']);
        Sanctum::actingAs($hr);
        $this->putJson('/api/admin/kiosk-override-pin', ['current_password' => 'Secret-123!', 'admin_pin' => '9876', 'admin_pin_confirmation' => '9876'])->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['role' => 'admin', 'password' => 'Secret-123!']));
        $this->putJson('/api/admin/kiosk-override-pin', ['current_password' => 'Secret-123!', 'admin_pin' => '9876', 'admin_pin_confirmation' => '9876'])->assertOk();
        $this->assertTrue(KioskSetting::current()->checkAdminPin('9876'));
    }

    public function test_history_by_date_range_newest_first_and_csv_export(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $emp = $this->employee();
        foreach (['2026-10-12', '2026-10-13', '2026-10-14'] as $d) {
            Attendance::create(['employee_id' => $emp->id, 'date' => $d, 'time_in' => '09:03:10', 'status' => 'late', 'late_minutes' => 3]);
        }
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-30', 'time_in' => '08:55:00', 'status' => 'present']);

        $list = $this->getJson('/api/attendances?from=2026-10-12&to=2026-10-25')->assertJsonCount(3)->json();
        $days = array_map(fn ($a) => \Carbon\Carbon::parse($a['date'])->setTimezone('Asia/Manila')->toDateString(), $list);
        $this->assertSame(['2026-10-14', '2026-10-13', '2026-10-12'], $days); // newest first

        $csv = $this->get("/api/attendances/export?from=2026-10-12&to=2026-10-25&employee_id={$emp->id}")->assertOk()->streamedContent();
        $lines = array_values(array_filter(explode("\n", $csv)));
        $this->assertCount(4, $lines);
        $this->assertStringStartsWith('"Employee ID",Name,Position,Date', $lines[0]);
        $this->assertStringStartsWith('EMP-0001,"Ana Reyes",Checker,2026-10-14,"9:03:10 AM"', $lines[1]);
    }

    public function test_settings_change_the_kiosk_lock_count(): void
    {
        Settings::set('kiosk.max_wrong_pins', 2);
        KioskSetting::current()->setPin('1234', null);
        $this->postJson('/api/kiosk/unlock', ['device_id' => self::DEVICE, 'pin' => '0000'])->assertStatus(422);
        $this->postJson('/api/kiosk/unlock', ['device_id' => self::DEVICE, 'pin' => '0000'])->assertStatus(423);
    }
}
