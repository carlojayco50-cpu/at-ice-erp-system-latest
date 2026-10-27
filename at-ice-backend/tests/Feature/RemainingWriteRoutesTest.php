<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\DeliveryContract;
use App\Models\Employee;
use App\Models\Order;
use App\Models\PickupLog;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use App\Support\DriverAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Happy paths for the write routes that no other test covered: suppliers,
// delivery contracts, pickup logs, the older order and payment routes, and the
// realtime channel login.
class RemainingWriteRoutesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Customer $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->store = Customer::create([
            'name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-020', 'branch_code' => 'ALF-SJDM-020',
            'invoice_code' => 'ALF', 'customer_type' => 'convenience_store', 'is_active' => true,
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_admin_adds_edits_and_deletes_a_supplier(): void
    {
        $id = $this->postJson('/api/suppliers', [
            'name' => 'Ice Plant Co', 'contact_person' => 'Juan', 'contact_number' => '09171234567',
        ])->assertCreated()->json('id');
        $this->assertNotEmpty(Supplier::find($id)->supplier_code);

        $this->putJson("/api/suppliers/{$id}", ['name' => 'Ice Plant Corporation', 'contact_person' => 'Juan'])
            ->assertOk()->assertJsonPath('name', 'Ice Plant Corporation');

        $this->deleteJson("/api/suppliers/{$id}")->assertOk();
        $this->assertSoftDeleted('suppliers', ['id' => $id]);
    }

    public function test_admin_creates_approves_and_cancels_a_delivery_contract(): void
    {
        $start = DriverAvailability::today();
        $contractId = $this->postJson('/api/delivery-contracts', [
            'name' => 'Weekly ice run',
            'store_ids' => [$this->store->id],
            'start_date' => $start,
            'end_date' => now(config('atice.timezone'))->addDays(30)->toDateString(),
            'delivery_days' => ['mon', 'wed'],
            'delivery_time' => '08:00',
            'items' => [['product_type' => 'bags', 'quantity' => 10]],
        ])->assertCreated()->json('id');
        $contract = DeliveryContract::findOrFail($contractId);
        $this->assertSame('pending', $contract->status);

        $this->postJson("/api/delivery-contracts/{$contractId}/approve")->assertOk();
        $this->assertSame('approved', $contract->fresh()->status);

        $this->postJson("/api/delivery-contracts/{$contractId}/cancel")->assertOk();
        $this->assertSame('cancelled', $contract->fresh()->status);
        $this->postJson("/api/delivery-contracts/{$contractId}/cancel")->assertUnprocessable();
    }

    public function test_a_checker_logs_a_pickup_and_admin_edits_and_removes_it(): void
    {
        $checker = User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']);
        $emp = Employee::create([
            'user_id' => $checker->id, 'employee_id' => 'EMP-0200', 'first_name' => 'Check', 'last_name' => 'Pick',
            'position' => 'Checker', 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true,
        ]);
        Attendance::create(['employee_id' => $emp->id, 'date' => now()->toDateString(), 'time_in' => now()->subMinutes(5)->format('H:i:s'), 'status' => 'present']);

        Sanctum::actingAs($checker);
        $id = $this->postJson('/api/pickup-logs', [
            'company_name' => 'Plant Pickup', 'product_type' => 'bags', 'quantity' => 20, 'pickup_date' => now()->toDateString(),
        ])->assertCreated()->json('log.id');

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/pickup-logs/{$id}", ['quantity' => 25])->assertOk();
        $this->assertSame(25, PickupLog::find($id)->quantity);

        $this->deleteJson("/api/pickup-logs/{$id}")->assertOk();
        $this->assertDatabaseMissing('pickup_logs', ['id' => $id, 'deleted_at' => null]);
    }

    public function test_admin_places_an_order_moves_its_status_and_cancels_it(): void
    {
        $product = Product::create(['product_code' => 'ICE-100', 'name' => 'Ice Bag', 'unit' => 'bag', 'unit_price' => 45, 'current_stock' => 100, 'minimum_stock' => 1]);

        $orderId = $this->postJson('/api/orders', [
            'customer_id' => $this->store->id,
            'order_date' => now()->toDateString(),
            'items' => [['product_id' => $product->id, 'quantity' => 4]],
        ])->assertCreated()->json('id');
        $this->assertEquals(180, (float) Order::find($orderId)->total_amount);

        $this->putJson("/api/orders/{$orderId}/status", ['status' => 'confirmed'])->assertOk();
        $this->assertSame('confirmed', Order::find($orderId)->status);

        $this->putJson("/api/orders/{$orderId}/cancel")->assertOk();
        $this->assertSame('cancelled', Order::find($orderId)->status);
    }

    public function test_admin_records_a_payment_against_an_order(): void
    {
        $product = Product::create(['product_code' => 'ICE-101', 'name' => 'Ice Bag', 'unit' => 'bag', 'unit_price' => 45, 'current_stock' => 100, 'minimum_stock' => 1]);
        $orderId = $this->postJson('/api/orders', [
            'customer_id' => $this->store->id, 'order_date' => now()->toDateString(),
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
        ])->assertCreated()->json('id');

        $this->postJson('/api/payments', [
            'order_id' => $orderId, 'amount' => 90, 'mop' => 'gcash', 'payment_date' => now()->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('payments', ['order_id' => $orderId, 'mop' => 'gcash']);
    }

    public function test_only_allowed_roles_get_a_realtime_channel_login(): void
    {
        // The local .env uses the log broadcaster, so the HTTP endpoint is not a
        // useful check here. Read the registered channel rules directly instead.
        $broadcaster = $this->app->make(\Illuminate\Contracts\Broadcasting\Broadcaster::class);
        $channels = (new \ReflectionProperty($broadcaster, 'channels'))->getValue($broadcaster);
        $rule = collect($channels)->first(fn ($callback, $pattern) => $pattern === 'payments');

        $this->assertNotNull($rule);
        $this->assertTrue((bool) $rule(User::factory()->make(['role' => 'admin'])));
        $this->assertFalse((bool) $rule(User::factory()->make(['role' => 'customer'])));
    }
}
