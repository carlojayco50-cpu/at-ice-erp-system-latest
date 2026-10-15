<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\User;
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
        $customer = Customer::create(['name' => 'Starmall', 'customer_code' => 'CUST-STA-001', 'branch_code' => 'STA-SJDM-001', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $customer->id, 'product_type' => 'bags', 'unit_price' => 50]);

        return [
            'driver_id' => $driver->id, 'customer_id' => $customer->id, 'delivery_type' => 'outbound',
            'scheduled_date' => now()->toDateString(),
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
}
