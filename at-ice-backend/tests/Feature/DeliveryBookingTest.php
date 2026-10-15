<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\User;
use App\Support\DriverAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryBookingTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private User $driver;

    private User $driver2;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
        $this->driver = User::create(['name' => 'Driver', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->driver2 = User::create(['name' => 'Driver 2', 'email' => 'driver2@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->customer = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $this->customer->id, 'product_type' => 'bags', 'unit_price' => 50]);

        // Both Drivers timed in today, so they can be assigned
        foreach ([$this->driver, $this->driver2] as $i => $d) {
            $emp = Employee::create(['user_id' => $d->id, 'employee_id' => 'EMP-000'.($i + 1), 'first_name' => $d->name, 'last_name' => 'Cruz', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);
            Attendance::create(['employee_id' => $emp->id, 'date' => DriverAvailability::today(), 'time_in' => '07:58:00', 'status' => 'present']);
        }
    }

    private function book(string $date, ?User $driver = null)
    {
        return $this->postJson('/api/deliveries', [
            'driver_id' => ($driver ?? $this->driver)->id, 'customer_id' => $this->customer->id,
            'delivery_type' => 'outbound', 'scheduled_date' => $date,
            'items' => [['product_type' => 'bags', 'quantity_ordered' => 10]],
        ]);
    }

    public function test_a_customer_cannot_be_booked_twice_on_the_same_day(): void
    {
        $today = DriverAvailability::today();
        $first = $this->book($today)->assertCreated()->json('id');

        // Another driver, same customer and day: refused
        $this->book($today, $this->driver2)->assertUnprocessable()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'already has delivery DEL-0001'));

        // A delivered one still holds the day
        Delivery::whereKey($first)->update(['status' => 'delivered']);
        $this->book($today)->assertUnprocessable();

        // Another day is fine
        $this->book(now(DriverAvailability::LOCAL_TZ)->addDay()->toDateString())->assertCreated();
        $this->assertSame(2, Delivery::count());
    }

    public function test_a_cancelled_delivery_frees_the_day(): void
    {
        $today = DriverAvailability::today();
        $first = $this->book($today)->assertCreated()->json('id');

        $this->putJson("/api/deliveries/{$first}/cancel")->assertOk();
        $this->book($today, $this->driver2)->assertCreated();
    }

    public function test_an_in_transit_delivery_holds_the_day(): void
    {
        $today = DriverAvailability::today();
        $first = $this->book($today)->assertCreated()->json('id');
        Delivery::whereKey($first)->update(['status' => 'in_transit']);

        $this->book($today, $this->driver2)->assertUnprocessable()
            ->assertJsonValidationErrors('scheduled_date');
    }

    public function test_driver_availability_comes_from_attendance_and_deliveries(): void
    {
        $today = DriverAvailability::today();
        $late = User::create(['name' => 'Late', 'email' => 'late@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        Employee::create(['user_id' => $late->id, 'employee_id' => 'EMP-0003', 'first_name' => 'Late', 'last_name' => 'Reyes', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);

        // driver: on a delivery in transit; driver2: timed in and free; late: no time in
        $first = $this->book($today)->assertCreated()->json('id');
        Delivery::whereKey($first)->update(['status' => 'in_transit']);

        $rows = collect($this->getJson('/api/deliveries/driver-availability')->assertOk()->assertJsonPath('enforced', true)->json('drivers'))->keyBy('id');
        $this->assertSame('in_transit', $rows[$this->driver->id]['status']);
        $this->assertSame('available', $rows[$this->driver2->id]['status']);
        $this->assertSame('unavailable', $rows[$late->id]['status']);
        $this->assertSame('Not timed in yet', $rows[$late->id]['reason']);
        $this->assertSame('EMP-0003', $rows[$late->id]['employee_id']);

        // A later day is not checked
        $this->getJson('/api/deliveries/driver-availability?date='.now(DriverAvailability::LOCAL_TZ)->addDay()->toDateString())
            ->assertJsonPath('enforced', false);
    }

    public function test_only_an_available_driver_can_be_assigned_today(): void
    {
        $today = DriverAvailability::today();
        $other = Customer::create(['name' => 'Puregold', 'customer_code' => 'CUST-PUR-001', 'branch_code' => 'PUR-SJDM-001', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $other->id, 'product_type' => 'bags', 'unit_price' => 50]);
        $late = User::create(['name' => 'Late', 'email' => 'late@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        Employee::create(['user_id' => $late->id, 'employee_id' => 'EMP-0003', 'first_name' => 'Late', 'last_name' => 'Reyes', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);

        // Not timed in yet: refused today, fine for tomorrow
        $this->book($today, $late)->assertUnprocessable()->assertJsonValidationErrors('driver_id')
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'unavailable'));
        $this->book(now(DriverAvailability::LOCAL_TZ)->addDay()->toDateString(), $late)->assertCreated();

        // In transit: refused
        $first = $this->book($today)->assertCreated()->json('id');
        Delivery::whereKey($first)->update(['status' => 'in_transit']);
        $this->postJson('/api/deliveries', [
            'driver_id' => $this->driver->id, 'customer_id' => $other->id,
            'delivery_type' => 'outbound', 'scheduled_date' => $today,
            'items' => [['product_type' => 'bags', 'quantity_ordered' => 5]],
        ])->assertUnprocessable()->assertJsonValidationErrors('driver_id')
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'in transit'));

        // Timed out: refused
        Attendance::whereDate('date', $today)->update(['time_out' => '17:00:00']);
        $this->postJson('/api/deliveries', [
            'driver_id' => $this->driver2->id, 'customer_id' => $other->id,
            'delivery_type' => 'outbound', 'scheduled_date' => $today,
            'items' => [['product_type' => 'bags', 'quantity_ordered' => 5]],
        ])->assertUnprocessable()->assertJsonValidationErrors('driver_id');

        // A non-driver user is refused too
        $this->postJson('/api/deliveries', [
            'driver_id' => User::where('role', 'admin')->value('id'), 'customer_id' => $other->id,
            'delivery_type' => 'outbound', 'scheduled_date' => $today,
            'items' => [['product_type' => 'bags', 'quantity_ordered' => 5]],
        ])->assertUnprocessable()->assertJsonValidationErrors('driver_id');
    }
}
