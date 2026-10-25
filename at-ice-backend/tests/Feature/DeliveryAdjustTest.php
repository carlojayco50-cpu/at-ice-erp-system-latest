<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\User;
use App\Support\DriverAvailability;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryAdjustTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $driver;

    private User $customerUser;

    private Customer $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-22 10:00:00', DriverAvailability::tz()));

        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $this->driver = User::create(['name' => 'Driver', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $emp = Employee::create(['user_id' => $this->driver->id, 'employee_id' => 'EMP-0001', 'first_name' => 'Driver', 'last_name' => 'Cruz', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);
        Attendance::create(['employee_id' => $emp->id, 'date' => DriverAvailability::today(), 'time_in' => '07:00:00', 'status' => 'present']);

        $this->customerUser = User::create(['name' => 'SM Fairview', 'email' => 'smf@example.com', 'password' => 'secret-password', 'role' => 'customer']);
        $this->store = Customer::create(['name' => 'SM Fairview', 'customer_code' => 'CUST-SMF-001', 'invoice_code' => 'SMF', 'is_active' => true, 'user_id' => $this->customerUser->id]);
        CustomerPrice::create(['customer_id' => $this->store->id, 'product_type' => 'small_sack', 'unit_price' => 150]);
        CustomerPrice::create(['customer_id' => $this->store->id, 'product_type' => 'big_sack', 'unit_price' => 250]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function morningDelivery(string $status = 'delivered'): Delivery
    {
        $d = Delivery::create(['delivery_no' => 'DEL-0001', 'customer_id' => $this->store->id, 'delivery_type' => 'outbound', 'driver_id' => $this->driver->id, 'status' => $status, 'scheduled_date' => DriverAvailability::today(), 'ordered_at' => now()->setTime(9, 0), 'prepared_by' => $this->admin->id]);
        $d->items()->create(['product_type' => 'small_sack', 'quantity_ordered' => 20, 'unit_price' => 150]);
        $d->items()->create(['product_type' => 'big_sack', 'quantity_ordered' => 10, 'unit_price' => 250]);

        return $d;
    }

    public function test_the_store_asks_for_a_4pm_top_up_after_its_morning_delivery(): void
    {
        $morning = $this->morningDelivery();

        Sanctum::actingAs($this->customerUser);
        $top = $this->postJson("/api/my-deliveries/{$morning->id}/top-up", ['items' => ['small_sack' => 15], 'deliver_by' => '16:00'])
            ->assertCreated()->json();

        $this->assertTrue($top['is_top_up']);
        $this->assertSame($morning->id, $top['parent_delivery_id']);
        $this->assertSame('pending', $top['status']);
        $this->assertSame($this->driver->id, $top['driver_id']);
        $this->assertSame(15, $top['items'][0]['quantity_ordered']);
        // the morning delivery is untouched
        $this->assertSame(20, $morning->items()->where('product_type', 'small_sack')->value('quantity_ordered'));
        $this->assertDatabaseHas('delivery_adjustments', ['delivery_id' => $top['id'], 'kind' => 'top_up', 'source' => 'customer']);

        // too soon, or past the daily cap
        $this->postJson("/api/my-deliveries/{$morning->id}/top-up", ['items' => ['small_sack' => 5], 'deliver_by' => '10:15'])
            ->assertStatus(422)->assertJsonValidationErrors('deliver_by');
    }

    public function test_a_top_up_is_queued_when_no_driver_is_free_and_never_blocks_the_one_off_booking_rule(): void
    {
        $morning = $this->morningDelivery();
        Attendance::query()->update(['time_out' => '09:30:00']); // the only Driver went home

        Sanctum::actingAs($this->admin);
        $top = $this->postJson("/api/deliveries/{$morning->id}/top-up", ['items' => ['big_sack' => 4], 'deliver_by' => '16:00'])
            ->assertCreated()->json();
        $this->assertSame('queued', $top['status']);
        $this->assertNull($top['driver_id']);
    }

    public function test_admin_changes_one_stores_delivery_with_a_reason_and_there_is_no_day_wide_cut(): void
    {
        $open = $this->morningDelivery('pending');

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/deliveries/{$open->id}/adjust", ['mode' => 'reduce', 'by' => 'count', 'value' => 5, 'product_type' => 'small_sack', 'reason' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson("/api/deliveries/{$open->id}/adjust", ['mode' => 'reduce', 'by' => 'count', 'value' => 5, 'product_type' => 'small_sack', 'reason' => 'Store called: heavy rain'])
            ->assertOk();
        $this->assertSame(15, $open->items()->where('product_type', 'small_sack')->value('quantity_ordered'));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'delivery.reduce_sacks')->count());

        // the Rainy day cut is gone (owner, 2026-10-22)
        $this->postJson('/api/deliveries/reduce-day', ['date' => DriverAvailability::today(), 'percent' => 20, 'reason' => 'Heavy rain'])
            ->assertStatus(405);
    }

    public function test_the_store_asks_to_change_its_delivery_and_admin_applies_it(): void
    {
        $open = $this->morningDelivery('pending');
        $other = Delivery::create(['delivery_no' => 'DEL-0002', 'customer_id' => $this->store->id, 'delivery_type' => 'outbound', 'driver_id' => $this->driver->id, 'status' => 'pending', 'scheduled_date' => DriverAvailability::today(), 'ordered_at' => now()->setTime(11, 0), 'prepared_by' => $this->admin->id]);
        $other->items()->create(['product_type' => 'small_sack', 'quantity_ordered' => 20, 'unit_price' => 150]);

        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 12], 'reason' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 20, 'big_sack' => 10], 'reason' => 'Raining'])
            ->assertStatus(422)->assertJsonValidationErrors('items');
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 0, 'big_sack' => 0], 'reason' => 'Closed today'])
            ->assertStatus(422)->assertJsonValidationErrors('items');
        $req = $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 12, 'big_sack' => 10], 'reason' => 'Heavy rain, slow sales'])
            ->assertCreated()->json();
        // nothing changes until Admin applies it, and one open request per delivery
        $this->assertSame(20, $open->items()->where('product_type', 'small_sack')->value('quantity_ordered'));
        $this->assertSame([['product_type' => 'small_sack', 'before' => 20, 'after' => 12]], $req['items']);
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 10], 'reason' => 'Even less'])
            ->assertStatus(422)->assertJsonValidationErrors('delivery');

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/delivery-adjustment-requests')->assertOk()
            ->assertJsonCount(1)->assertJsonPath('0.delivery.delivery_no', 'DEL-0001')->assertJsonPath('0.delivery_open', true);
        $this->postJson("/api/delivery-adjustment-requests/{$req['id']}/apply", ['note' => 'OK, 12 sacks'])
            ->assertOk()->assertJsonPath('status', 'applied');

        $this->assertSame(12, $open->items()->where('product_type', 'small_sack')->value('quantity_ordered'));
        $this->assertSame(10, $open->items()->where('product_type', 'big_sack')->value('quantity_ordered'));
        // only that store's delivery changed
        $this->assertSame(20, $other->items()->value('quantity_ordered'));
        $this->assertDatabaseHas('delivery_adjustments', ['delivery_id' => $open->id, 'kind' => 'reduce', 'source' => 'customer']);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'delivery.adjustment_requested')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'delivery.adjustment_request_applied')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'delivery.reduce_sacks')->count());
        $this->postJson("/api/delivery-adjustment-requests/{$req['id']}/apply")->assertStatus(422);

        // the store sees the answer on its delivery
        Sanctum::actingAs($this->customerUser);
        $mine = collect($this->getJson('/api/my-delivery-history')->assertOk()->json())->firstWhere('id', $open->id);
        $this->assertSame('applied', $mine['adjustment_request']['status']);
        $this->assertSame(12, collect($mine['items'])->firstWhere('product_type', 'small_sack')['quantity_ordered']);
    }

    public function test_admin_declines_with_a_note_and_the_store_can_withdraw(): void
    {
        $open = $this->morningDelivery('queued');

        Sanctum::actingAs($this->customerUser);
        $req = $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['big_sack' => 14], 'reason' => 'Fast sales today'])
            ->assertCreated()->json();

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/delivery-adjustment-requests/{$req['id']}/decline", ['note' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('note');
        $this->postJson("/api/delivery-adjustment-requests/{$req['id']}/decline", ['note' => 'Truck is full today'])
            ->assertOk()->assertJsonPath('status', 'declined');
        $this->assertSame(10, $open->items()->where('product_type', 'big_sack')->value('quantity_ordered'));

        Sanctum::actingAs($this->customerUser);
        $mine = collect($this->getJson('/api/my-delivery-history')->json())->firstWhere('id', $open->id);
        $this->assertSame('Truck is full today', $mine['adjustment_request']['review_note']);

        // a new request after the answer, then withdrawn before Admin answers
        $again = $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['big_sack' => 12], 'reason' => 'A little more'])
            ->assertCreated()->json();
        $this->postJson("/api/my-adjustment-requests/{$again['id']}/withdraw")->assertOk()->assertJsonPath('status', 'withdrawn');
        $this->postJson("/api/my-adjustment-requests/{$again['id']}/withdraw")->assertStatus(422);
    }

    public function test_requests_only_for_the_stores_own_open_delivery(): void
    {
        $open = $this->morningDelivery('pending');
        $other = User::create(['name' => 'Other', 'email' => 'other@example.com', 'password' => 'secret-password', 'role' => 'customer']);
        Customer::create(['name' => 'Other Store', 'customer_code' => 'CUST-OTH-001', 'invoice_code' => 'OTH', 'is_active' => true, 'user_id' => $other->id]);

        Sanctum::actingAs($other);
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 5], 'reason' => 'Rain'])->assertNotFound();

        Sanctum::actingAs($this->customerUser);
        $req = $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 5], 'reason' => 'Rain'])->assertCreated()->json();

        // delivered before Admin answered: it cannot be applied any more
        $open->update(['status' => 'delivered']);
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/delivery-adjustment-requests/{$req['id']}/apply")->assertStatus(422);
        $this->getJson('/api/delivery-adjustment-requests')->assertJsonPath('0.delivery_open', false);

        Sanctum::actingAs($this->customerUser);
        $this->postJson("/api/my-deliveries/{$open->id}/adjustment-requests", ['items' => ['small_sack' => 4], 'reason' => 'Rain'])
            ->assertStatus(422)->assertJsonValidationErrors('delivery');
    }

    public function test_adding_sacks_and_the_limits_of_an_adjustment(): void
    {
        $open = $this->morningDelivery('in_transit');

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/deliveries/{$open->id}/adjust", ['mode' => 'add', 'by' => 'count', 'value' => 3, 'product_type' => 'big_sack', 'reason' => 'Extra for the weekend'])->assertOk();
        $this->assertSame(13, $open->items()->where('product_type', 'big_sack')->value('quantity_ordered'));

        // cannot leave a delivery empty, and a delivered one cannot change
        $this->postJson("/api/deliveries/{$open->id}/adjust", ['mode' => 'reduce', 'by' => 'percent', 'value' => 100, 'reason' => 'Storm'])
            ->assertStatus(422);
        $open->update(['status' => 'delivered']);
        $this->postJson("/api/deliveries/{$open->id}/adjust", ['mode' => 'add', 'by' => 'count', 'value' => 1, 'reason' => 'Late add'])
            ->assertStatus(422);
    }

    public function test_a_customer_cannot_top_up_another_stores_delivery(): void
    {
        $morning = $this->morningDelivery();
        $other = User::create(['name' => 'Other', 'email' => 'other@example.com', 'password' => 'secret-password', 'role' => 'customer']);
        Customer::create(['name' => 'Other Store', 'customer_code' => 'CUST-OTH-001', 'invoice_code' => 'OTH', 'is_active' => true, 'user_id' => $other->id]);

        Sanctum::actingAs($other);
        $this->postJson("/api/my-deliveries/{$morning->id}/top-up", ['items' => ['small_sack' => 5], 'deliver_by' => '16:00'])->assertNotFound();
    }
}
