<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DriverStoreAssignment;
use App\Models\User;
use App\Support\DriverAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriverStoreAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $driver;

    private Customer $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->driver = User::factory()->create(['role' => 'driver']);
        $this->store = Customer::create([
            'name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-010', 'branch_code' => 'ALF-SJDM-010',
            'invoice_code' => 'ALF', 'customer_type' => 'convenience_store', 'is_active' => true,
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_admin_assigns_a_driver_to_a_store_from_today(): void
    {
        $today = DriverAvailability::today();

        $this->postJson('/api/driver-store-assignments', [
            'driver_id' => $this->driver->id,
            'store_ids' => [$this->store->id],
            'effective_from' => $today,
        ])->assertCreated()->assertJsonPath('assignments.0.store_id', $this->store->id);

        $this->assertDatabaseHas('driver_store_assignments', [
            'driver_id' => $this->driver->id, 'store_id' => $this->store->id, 'effective_from' => $today,
        ]);
    }

    public function test_a_newer_assignment_replaces_the_store_driver_from_the_same_day(): void
    {
        $today = DriverAvailability::today();
        $second = User::factory()->create(['role' => 'driver']);

        $this->postJson('/api/driver-store-assignments', ['driver_id' => $this->driver->id, 'store_ids' => [$this->store->id], 'effective_from' => $today])->assertCreated();
        $this->postJson('/api/driver-store-assignments', ['driver_id' => $second->id, 'store_ids' => [$this->store->id], 'effective_from' => $today])->assertCreated();

        $open = DriverStoreAssignment::where('store_id', $this->store->id)->get();
        $this->assertCount(1, $open);
        $this->assertSame($second->id, $open->first()->driver_id);
    }

    public function test_only_a_driver_account_can_be_assigned(): void
    {
        $notDriver = User::factory()->create(['role' => 'employee']);

        $this->postJson('/api/driver-store-assignments', [
            'driver_id' => $notDriver->id, 'store_ids' => [$this->store->id], 'effective_from' => DriverAvailability::today(),
        ])->assertUnprocessable();
    }

    public function test_ending_an_assignment_removes_it(): void
    {
        $this->postJson('/api/driver-store-assignments', [
            'driver_id' => $this->driver->id, 'store_ids' => [$this->store->id], 'effective_from' => DriverAvailability::today(),
        ])->assertCreated();
        $id = DriverStoreAssignment::value('id');

        $this->deleteJson("/api/driver-store-assignments/{$id}")->assertOk();

        $this->assertDatabaseMissing('driver_store_assignments', ['id' => $id]);
    }
}
