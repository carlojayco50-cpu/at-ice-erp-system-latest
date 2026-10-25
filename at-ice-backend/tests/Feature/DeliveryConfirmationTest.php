<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryArrival;
use App\Models\DeliveryCrew;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryConfirmationTest extends TestCase
{
    use RefreshDatabase;

    private function delivery(string $status): Delivery
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $driver = $this->timedIn(User::create(['name' => 'Driver', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']));
        $customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'invoice_code' => 'PG', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $customer->id, 'product_type' => 'bags', 'unit_price' => 50]);

        return Delivery::create([
            'delivery_no' => 'DEL-0001', 'driver_id' => $driver->id, 'customer_id' => $customer->id,
            'status' => $status, 'scheduled_date' => now()->toDateString(), 'prepared_by' => $admin->id,
        ]);
    }

    // The Salesman rides with the delivery's Driver and, unless $arrived is
    // false, both pressed Arrived at the store.
    private function confirm(Delivery $delivery, int $quantity = 2, bool $arrived = true)
    {
        Storage::fake('public');
        $salesman = $this->timedIn(User::create(['name' => 'Salesman', 'email' => 'sales@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']));
        DeliveryCrew::create(['date' => now()->toDateString(), 'salesman_id' => $salesman->id, 'driver_id' => $delivery->driver_id]);
        if ($arrived) {
            foreach ([[$delivery->driver_id, 'driver'], [$salesman->id, 'salesman']] as [$userId, $role]) {
                DeliveryArrival::create(['delivery_id' => $delivery->id, 'user_id' => $userId, 'role' => $role, 'latitude' => 14.8, 'longitude' => 121.05, 'distance_m' => 10, 'arrived_at' => now()]);
            }
        }
        Sanctum::actingAs($salesman);
        // A 1x1 JPEG (no GD needed)
        $jpeg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');

        return $this->post('/api/delivery-confirmation', [
            'delivery_id' => $delivery->id,
            'products' => [['product_type' => 'bags', 'quantity' => $quantity]],
            'photo' => UploadedFile::fake()->createWithContent('photo.jpg', $jpeg),
        ], ['Accept' => 'application/json']);
    }

    public function test_salesman_cannot_confirm_before_the_driver_starts(): void
    {
        $delivery = $this->delivery('pending');

        $this->confirm($delivery)->assertUnprocessable()->assertJsonFragment(['message' => 'The driver has not started this delivery yet. You can confirm it once it is In Transit.']);
        $this->assertSame('pending', $delivery->fresh()->status);
        $this->assertDatabaseCount('delivery_proofs', 0);
    }

    public function test_quantity_is_500_at_most(): void
    {
        $delivery = $this->delivery('in_transit');

        $this->confirm($delivery, 501)->assertUnprocessable()->assertJsonValidationErrors('products.0.quantity');
        $this->assertDatabaseCount('delivery_proofs', 0);
    }

    public function test_salesman_cannot_confirm_until_both_arrived(): void
    {
        $delivery = $this->delivery('in_transit');

        $this->confirm($delivery, 2, false)->assertUnprocessable()->assertJsonFragment(['message' => 'Both the Driver and you must press Arrived at the store before the delivery can be confirmed.']);
        $this->assertSame('in_transit', $delivery->fresh()->status);
    }

    public function test_salesman_confirms_once_the_delivery_is_in_transit(): void
    {
        $delivery = $this->delivery('in_transit');

        $this->confirm($delivery)->assertSuccessful();
        $this->assertSame('delivered', $delivery->fresh()->status);
        $this->assertDatabaseCount('delivery_proofs', 1);
    }

    public function test_confirmed_delivery_stays_in_the_salesmans_list_with_its_receipt(): void
    {
        $delivery = $this->delivery('in_transit');
        $this->confirm($delivery)->assertSuccessful();

        $row = collect($this->getJson('/api/my-deliveries')->assertOk()->json())->firstWhere('id', $delivery->id);
        $this->assertNotNull($row);
        $this->assertSame('delivered', $row['status']);
        // Invoice number: the customer's invoice code, today's date, then 001.
        $this->assertSame('PG-'.now()->format('Ymd').'-001', $row['proofs'][0]['receipt']['receipt_no']);
        $this->assertSame(2, (int) $row['proofs'][0]['receipt']['items'][0]['quantity']);

        // another Salesman does not see it
        Sanctum::actingAs(User::create(['name' => 'Other', 'email' => 'other@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']));
        $this->assertNull(collect($this->getJson('/api/my-deliveries')->json())->firstWhere('id', $delivery->id));
    }

    public function test_a_short_delivery_keeps_what_was_ordered_next_to_what_was_delivered(): void
    {
        $delivery = $this->delivery('in_transit');
        $delivery->items()->create(['product_type' => 'bags', 'quantity_ordered' => 500, 'unit_price' => 50]);

        $this->confirm($delivery, 400)->assertSuccessful();

        $line = $delivery->fresh()->items->first();
        $this->assertSame(400, (int) $line->quantity_delivered);
        $this->assertSame(500, (int) $line->quantity_ordered);
        $this->assertDatabaseHas('receipt_items', ['product_type' => 'bags', 'quantity' => 400, 'quantity_ordered' => 500]);
    }
}
