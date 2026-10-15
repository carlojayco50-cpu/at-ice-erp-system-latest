<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
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
        $driver = User::create(['name' => 'Driver', 'email' => 'driver@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
        CustomerPrice::create(['customer_id' => $customer->id, 'product_type' => 'bags', 'unit_price' => 50]);

        return Delivery::create([
            'delivery_no' => 'DEL-0001', 'driver_id' => $driver->id, 'customer_id' => $customer->id,
            'status' => $status, 'scheduled_date' => now()->toDateString(), 'prepared_by' => $admin->id,
        ]);
    }

    private function confirm(Delivery $delivery, int $quantity = 2)
    {
        Storage::fake('public');
        $salesman = User::create(['name' => 'Salesman', 'email' => 'sales@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
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
        $this->assertNotEmpty($row['proofs'][0]['receipt']['receipt_no']);
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
