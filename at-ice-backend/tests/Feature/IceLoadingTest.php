<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\IceLoading;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IceLoadingTest extends TestCase
{
    use RefreshDatabase;

    private User $checker;

    private User $driver;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs($this->checker = User::create(['name' => 'Checker', 'email' => 'checker@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'checker']));
        // A Checker can only save after timing in at the kiosk
        $emp = Employee::create(['user_id' => $this->checker->id, 'employee_id' => 'EMP-0009', 'first_name' => 'Check', 'last_name' => 'Er', 'position' => 'Checker', 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true]);
        Attendance::create(['employee_id' => $emp->id, 'date' => Carbon::now(config('atice.timezone'))->toDateString(), 'time_in' => Carbon::now(config('atice.timezone'))->subMinutes(5)->format('H:i:s'), 'status' => 'present']);
        $this->driver = User::create(['name' => 'Driver One', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
    }

    private function delivery(string $no, string $date, string $status = 'pending', ?Customer $customer = null): Delivery
    {
        return Delivery::create([
            'delivery_no' => $no, 'driver_id' => $this->driver->id, 'customer_id' => ($customer ?? $this->customer)->id,
            'status' => $status, 'scheduled_date' => $date, 'prepared_by' => $this->checker->id,
        ]);
    }

    private function today(): string
    {
        return Carbon::now(config('atice.timezone'))->toDateString();
    }

    public function test_loaded_at_is_saved_as_manila_time(): void
    {
        $delivery = $this->delivery('DEL-0001', $this->today());

        $this->postJson('/api/ice-loadings', [
            'delivery_id' => $delivery->id, 'loaded_at' => '2026-10-15T20:30',
            'items' => [['product_type' => 'bags', 'quantity' => 10]],
        ])->assertCreated();

        $saved = IceLoading::first()->loaded_at;
        // 8:30 PM in Manila is 12:30 UTC, and reads back as 8:30 PM in Manila
        $this->assertSame('2026-10-15 12:30', $saved->copy()->utc()->format('Y-m-d H:i'));
        $this->assertSame('2026-10-15 20:30', $saved->copy()->setTimezone('Asia/Manila')->format('Y-m-d H:i'));
    }

    public function test_quantity_is_limited_per_product(): void
    {
        $delivery = $this->delivery('DEL-0001', $this->today());
        $payload = fn (int $q) => ['delivery_id' => $delivery->id, 'loaded_at' => '2026-10-15T20:30', 'items' => [['product_type' => 'bags', 'quantity' => $q]]];

        $this->postJson('/api/ice-loadings', $payload(501))->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
        $this->postJson('/api/ice-loadings', $payload(500))->assertCreated();
    }

    public function test_a_cancelled_delivery_cannot_be_loaded(): void
    {
        $delivery = $this->delivery('DEL-0001', $this->today(), 'cancelled');

        $this->postJson('/api/ice-loadings', [
            'delivery_id' => $delivery->id, 'loaded_at' => '2026-10-15T20:30',
            'items' => [['product_type' => 'bags', 'quantity' => 5]],
        ])->assertUnprocessable();
        $this->assertDatabaseCount('ice_loadings', 0);
    }

    public function test_the_dropdown_lists_open_deliveries_up_to_today_with_customer_and_driver(): void
    {
        $other = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        $today = $this->delivery('DEL-0001', $this->today());
        $overdue = $this->delivery('DEL-0002', Carbon::parse($this->today())->subDay()->toDateString(), 'in_transit', $other);
        $this->delivery('DEL-0003', $this->today(), 'cancelled', $other);
        $this->delivery('DEL-0004', Carbon::parse($this->today())->addDay()->toDateString(), 'pending', $other);
        $this->delivery('DEL-0005', $this->today(), 'delivered', $other);

        $rows = collect($this->getJson('/api/ice-loadings/deliveries')->assertOk()->json());

        // Oldest first; cancelled, delivered and future-dated bookings are left out
        $this->assertSame(['DEL-0002', 'DEL-0001'], $rows->pluck('delivery_no')->all());
        $this->assertSame(['Starmall', 'Driver One', false], [$rows[0]['customer'], $rows[0]['driver'], $rows[0]['loaded']]);
        $this->assertSame($overdue->id, $rows[0]['id']);
        $this->assertSame($today->id, $rows[1]['id']);

        // Once counted, the row says so
        $this->postJson('/api/ice-loadings', [
            'delivery_id' => $today->id, 'loaded_at' => '2026-10-15T20:30',
            'items' => [['product_type' => 'bags', 'quantity' => 10]],
        ])->assertCreated();
        $row = collect($this->getJson('/api/ice-loadings/deliveries')->json())->firstWhere('id', $today->id);
        $this->assertTrue($row['loaded']);
        $this->assertSame('Checker', $row['loaded_by']);
    }
}
