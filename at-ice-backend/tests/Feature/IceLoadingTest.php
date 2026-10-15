<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
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

    public function test_the_dropdown_lists_todays_deliveries_with_customer_and_driver(): void
    {
        $other = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        $today = $this->delivery('DEL-0001', $this->today());
        $this->delivery('DEL-0002', Carbon::parse($this->today())->subDay()->toDateString(), 'pending', $other);
        $this->delivery('DEL-0003', $this->today(), 'cancelled', $other);

        $rows = $this->getJson('/api/ice-loadings/deliveries')->assertOk()->json();

        $this->assertSame([['id' => $today->id, 'delivery_no' => 'DEL-0001', 'customer' => 'Alfamart Muzon', 'driver' => 'Driver One']], $rows);
    }
}
