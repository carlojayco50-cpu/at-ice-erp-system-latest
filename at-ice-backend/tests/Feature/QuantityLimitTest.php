<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Employee;
use App\Models\User;
use App\Support\DriverAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// One per-product limit (config/atice.php) for New Delivery, Ice Loading and the
// Salesman's confirmation.
class QuantityLimitTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
    }

    private function booking(int $quantity): array
    {
        $driver = User::create(['name' => 'Driver', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        // Only a Driver who timed in today can be given a delivery
        $emp = Employee::create(['user_id' => $driver->id, 'employee_id' => 'EMP-0001', 'first_name' => 'Driver', 'last_name' => 'Cruz', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);
        Attendance::create(['employee_id' => $emp->id, 'date' => DriverAvailability::today(), 'time_in' => '07:58:00', 'status' => 'present']);
        $customer = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $customer->id, 'product_type' => 'bags', 'unit_price' => 50]);

        return [
            'driver_id' => $driver->id, 'customer_id' => $customer->id, 'delivery_type' => 'outbound',
            'scheduled_date' => DriverAvailability::today(),
            'items' => [['product_type' => 'bags', 'quantity_ordered' => $quantity]],
        ];
    }

    public function test_the_limit_is_500_by_default_and_served_to_the_forms(): void
    {
        $this->admin();

        $this->getJson('/api/limits')->assertOk()->assertExactJson(['max_product_quantity' => 500]);
    }

    public function test_new_delivery_refuses_more_than_the_limit(): void
    {
        $this->admin();
        $payload = $this->booking(501);

        $this->postJson('/api/deliveries', $payload)->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity_ordered');
        $this->assertDatabaseCount('deliveries', 0);

        $payload['items'][0]['quantity_ordered'] = 500;
        $this->postJson('/api/deliveries', $payload)->assertCreated();
    }

    public function test_the_limit_comes_from_one_config_value(): void
    {
        config(['atice.max_product_quantity' => 100]);
        $this->admin();

        $this->getJson('/api/limits')->assertJsonPath('max_product_quantity', 100);
        $this->postJson('/api/deliveries', $this->booking(101))->assertUnprocessable();
    }

    // Every other way to write a quantity is held to the same limit.
    public function test_editing_topping_up_adjusting_and_contracts_use_the_same_limit(): void
    {
        $this->admin();
        $payload = $this->booking(10);
        $id = $this->postJson('/api/deliveries', $payload)->assertCreated()->json('id');

        $this->putJson("/api/deliveries/{$id}", ['items' => [['product_type' => 'bags', 'quantity_ordered' => 501]]])
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity_ordered');
        $this->putJson("/api/deliveries/{$id}", ['items' => [['product_type' => 'bags', 'quantity_ordered' => 500]]])->assertOk();

        $this->postJson("/api/deliveries/{$id}/top-up", ['items' => ['bags' => 501], 'deliver_by' => '23:00'])
            ->assertUnprocessable()->assertJsonValidationErrors('items.bags');
        $this->postJson("/api/deliveries/{$id}/adjust", ['mode' => 'add', 'by' => 'count', 'value' => 1, 'reason' => 'one more'])
            ->assertUnprocessable()->assertJsonValidationErrors('value');

        $this->postJson('/api/delivery-contracts', [
            'name' => 'Starmall', 'store_ids' => [$payload['customer_id']], 'start_date' => DriverAvailability::today(),
            'end_date' => DriverAvailability::today(), 'delivery_days' => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            'delivery_time' => '08:00', 'items' => [['product_type' => 'bags', 'quantity' => 501]],
        ])->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
    }
}
