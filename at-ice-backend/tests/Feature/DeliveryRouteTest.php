<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The Driver and the Salesman riding with them see the same route, nearest the
// plant first; the Salesman may switch to any Driver who has timed in; Arrived
// needs the phone's GPS near the store pin (owner, 2026-10-20).
class DeliveryRouteTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $ana;

    private User $ben;

    private User $offDuty;

    private User $salesman;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $this->ana = $this->timedIn(User::create(['name' => 'Ana', 'email' => 'ana@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']));
        $this->ben = $this->timedIn(User::create(['name' => 'Ben', 'email' => 'ben@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']));
        $this->offDuty = User::create(['name' => 'Carlo', 'email' => 'carlo@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->salesman = $this->timedIn(User::create(['name' => 'Sam', 'email' => 'sam@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']));
    }

    private function stop(User $driver, string $name, float $lat, float $lng, string $status = 'pending'): Delivery
    {
        static $n = 0;
        $n++;
        $store = Customer::create(['name' => $name, 'customer_code' => "CUST-T-00{$n}", 'branch_code' => "T-00{$n}", 'is_active' => true, 'latitude' => $lat, 'longitude' => $lng]);

        return Delivery::create(['delivery_no' => sprintf('DEL-%04d', $n), 'driver_id' => $driver->id, 'customer_id' => $store->id, 'status' => $status, 'scheduled_date' => now()->toDateString(), 'prepared_by' => $this->admin->id]);
    }

    public function test_driver_and_salesman_see_the_same_route_nearest_the_plant_first(): void
    {
        // plant at 14.8031, 121.0515 (Settings defaults)
        $far = $this->stop($this->ana, 'Far store', 14.8500, 121.0900);
        $near = $this->stop($this->ana, 'Near store', 14.8040, 121.0520);
        $middle = $this->stop($this->ana, 'Middle store', 14.8200, 121.0600);

        Sanctum::actingAs($this->ana);
        $driverIds = collect($this->getJson('/api/driver/deliveries')->assertOk()->json('deliveries'))->where('route_today', true)->pluck('id')->all();
        $this->assertSame([$near->id, $middle->id, $far->id], $driverIds);

        // the system picks a Driver for the Salesman; ride with Ana
        Sanctum::actingAs($this->salesman);
        $this->putJson('/api/my-route/driver', ['driver_id' => $this->ana->id])->assertOk();
        $route = $this->getJson('/api/my-route')->assertOk();
        $this->assertSame($this->ana->id, $route->json('crew.driver_id'));
        $this->assertSame('salesman', $route->json('crew.chosen_by'));
        $this->assertSame($driverIds, collect($route->json('route'))->pluck('id')->all());
        $this->assertSame(1, $route->json('route.0.stop_no'));
    }

    public function test_salesman_gets_a_driver_on_shift_and_may_only_switch_to_one_who_timed_in(): void
    {
        Sanctum::actingAs($this->salesman);
        $route = $this->getJson('/api/my-route')->assertOk();
        $this->assertContains($route->json('crew.driver_id'), [$this->ana->id, $this->ben->id]);
        $this->assertSame('system', $route->json('crew.chosen_by'));
        $this->assertEqualsCanonicalizing([$this->ana->id, $this->ben->id], collect($route->json('drivers'))->pluck('id')->all());

        $this->putJson('/api/my-route/driver', ['driver_id' => $this->offDuty->id])->assertUnprocessable();
        $this->putJson('/api/my-route/driver', ['driver_id' => $this->ben->id])->assertOk();
        $this->assertSame($this->ben->id, $this->getJson('/api/my-route')->json('crew.driver_id'));
    }

    public function test_arrived_needs_the_phone_near_the_store_pin(): void
    {
        $stop = $this->stop($this->ana, 'Alfamart Muzon', 14.8100, 121.0500, 'in_transit');
        $pending = $this->stop($this->ana, 'Not started', 14.8000, 121.0500);

        Sanctum::actingAs($this->ana);
        // about 1.1 km away: refused
        $this->postJson("/api/driver/deliveries/{$stop->id}/arrive", ['latitude' => 14.8200, 'longitude' => 121.0500])->assertUnprocessable();
        // at the store: accepted
        $this->postJson("/api/driver/deliveries/{$stop->id}/arrive", ['latitude' => 14.8101, 'longitude' => 121.0501, 'accuracy' => 12])->assertOk();
        $this->postJson("/api/driver/deliveries/{$pending->id}/arrive", ['latitude' => 14.8000, 'longitude' => 121.0500])->assertUnprocessable();

        // a Salesman on another Driver's route cannot arrive here
        Sanctum::actingAs($this->salesman);
        $this->putJson('/api/my-route/driver', ['driver_id' => $this->ben->id])->assertOk();
        $this->postJson("/api/my-route/deliveries/{$stop->id}/arrive", ['latitude' => 14.8101, 'longitude' => 121.0501])->assertForbidden();
        $this->putJson('/api/my-route/driver', ['driver_id' => $this->ana->id])->assertOk();
        $this->postJson("/api/my-route/deliveries/{$stop->id}/arrive", ['latitude' => 14.8101, 'longitude' => 121.0501])->assertOk()
            ->assertJsonPath('delivery.arrival.driver', true)->assertJsonPath('delivery.arrival.salesman', true);
    }
}
