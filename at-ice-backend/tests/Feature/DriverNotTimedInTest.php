<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\User;
use App\Support\DeliveryDispatch;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Admin no longer marks a Driver absent (owner, 2026-10-20): a Driver still
// not timed in delivery.not_timed_in_minutes after their shift starts is off,
// and their pending deliveries today go to a Driver who is free.
class DriverNotTimedInTest extends TestCase
{
    use RefreshDatabase;

    private User $late;

    private User $working;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-20 08:30:00', 'Asia/Manila'));
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        Sanctum::actingAs($admin);

        $this->late = User::create(['name' => 'Late', 'email' => 'late@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->working = User::create(['name' => 'Working', 'email' => 'working@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        foreach ([$this->late, $this->working] as $i => $d) {
            $emp = Employee::create(['user_id' => $d->id, 'employee_id' => 'EMP-000'.($i + 1), 'first_name' => $d->name, 'last_name' => 'Cruz', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true, 'shift_start' => '07:00', 'shift_end' => '16:00']);
            if ($d->is($this->working)) {
                Attendance::create(['employee_id' => $emp->id, 'date' => '2026-10-20', 'time_in' => '06:55:00', 'status' => 'present']);
            }
        }

        $store = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        Delivery::create(['delivery_no' => 'DEL-0001', 'driver_id' => $this->late->id, 'customer_id' => $store->id, 'delivery_type' => 'outbound', 'status' => 'pending', 'scheduled_date' => '2026-10-20', 'ordered_at' => '2026-10-20 10:00:00', 'prepared_by' => $admin->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_a_driver_is_off_only_once_the_wait_after_the_shift_start_has_passed(): void
    {
        // 07:00 shift + 60 minutes: still waiting at 07:30
        Carbon::setTestNow(Carbon::parse('2026-10-20 07:30:00', 'Asia/Manila'));
        $this->assertArrayNotHasKey($this->late->id, DeliveryDispatch::offDrivers('2026-10-20'));

        Carbon::setTestNow(Carbon::parse('2026-10-20 08:30:00', 'Asia/Manila'));
        $off = DeliveryDispatch::offDrivers('2026-10-20');
        $this->assertSame('Not timed in', $off[$this->late->id] ?? null);
        $this->assertArrayNotHasKey($this->working->id, $off);
    }

    public function test_their_pending_deliveries_go_to_a_driver_who_is_free(): void
    {
        DeliveryDispatch::reassign($this->late->id, '2026-10-20');

        $d = Delivery::first();
        $this->assertSame($this->working->id, $d->driver_id);
        $this->assertSame($this->late->id, $d->reassigned_from_driver_id);
    }

    public function test_admin_can_no_longer_mark_a_driver_off(): void
    {
        $this->postJson('/api/driver-leaves', ['driver_id' => $this->late->id, 'date' => '2026-10-20', 'type' => 'absent'])
            ->assertNotFound();
    }
}
