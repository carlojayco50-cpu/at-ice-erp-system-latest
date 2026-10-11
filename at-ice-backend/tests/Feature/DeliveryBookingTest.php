<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\User;
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
        $today = now()->toDateString();
        $first = $this->book($today)->assertCreated()->json('id');

        // Another driver, same customer and day: refused
        $this->book($today, $this->driver2)->assertUnprocessable()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'already has delivery DEL-0001'));

        // A delivered one still holds the day
        Delivery::whereKey($first)->update(['status' => 'delivered']);
        $this->book($today)->assertUnprocessable();

        // Another day is fine
        $this->book(now()->addDay()->toDateString())->assertCreated();
        $this->assertSame(2, Delivery::count());
    }

    public function test_a_cancelled_delivery_frees_the_day(): void
    {
        $today = now()->toDateString();
        $first = $this->book($today)->assertCreated()->json('id');

        $this->putJson("/api/deliveries/{$first}/cancel")->assertOk();
        $this->book($today, $this->driver2)->assertCreated();
    }
}
