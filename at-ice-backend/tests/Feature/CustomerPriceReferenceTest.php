<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\ReferencePrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerPriceReferenceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Customer $dealer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->dealer = Customer::create([
            'name' => 'Dealer A', 'customer_code' => 'CUST-DLR-001', 'invoice_code' => 'DLR',
            'customer_type' => 'dealer', 'is_active' => true,
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_admin_sets_reference_prices_for_a_customer_type(): void
    {
        $this->putJson('/api/reference-prices/dealer', ['prices' => ['bags' => 45, 'small_sack' => 60, 'big_sack' => 90]])
            ->assertOk();

        $this->assertSame(45.0, ReferencePrice::for('dealer', 'bags'));
        $this->assertSame(90.0, ReferencePrice::for('dealer', 'big_sack'));
        $this->getJson('/api/reference-prices')->assertOk()->assertJsonPath('prices.dealer.bags', 45);
    }

    public function test_a_blank_reference_price_removes_that_price(): void
    {
        $this->putJson('/api/reference-prices/dealer', ['prices' => ['bags' => 45]])->assertOk();
        $this->putJson('/api/reference-prices/dealer', ['prices' => ['bags' => null]])->assertOk();

        $this->assertNull(ReferencePrice::for('dealer', 'bags'));
    }

    public function test_a_custom_price_is_kept_but_one_equal_to_the_reference_follows_it(): void
    {
        $this->putJson('/api/reference-prices/dealer', ['prices' => ['bags' => 45, 'small_sack' => 60]])->assertOk();

        $this->putJson("/api/customer-prices/{$this->dealer->id}", ['prices' => ['bags' => 40, 'small_sack' => 60]])->assertOk();

        $this->assertDatabaseHas('customer_prices', ['customer_id' => $this->dealer->id, 'product_type' => 'bags', 'unit_price' => 40]);
        $this->assertDatabaseMissing('customer_prices', ['customer_id' => $this->dealer->id, 'product_type' => 'small_sack']);
    }

    public function test_reset_sends_a_customer_back_to_the_reference_prices(): void
    {
        CustomerPrice::create(['customer_id' => $this->dealer->id, 'product_type' => 'bags', 'unit_price' => 40]);

        $this->deleteJson("/api/customer-prices/{$this->dealer->id}")->assertOk();

        $this->assertDatabaseMissing('customer_prices', ['customer_id' => $this->dealer->id]);
    }

    public function test_apply_drops_every_custom_price_of_that_type_only(): void
    {
        $other = Customer::create([
            'name' => 'Mall B', 'customer_code' => 'CUST-SM-001', 'invoice_code' => 'SMB',
            'customer_type' => 'supermarket', 'is_active' => true,
        ]);
        CustomerPrice::create(['customer_id' => $this->dealer->id, 'product_type' => 'bags', 'unit_price' => 40]);
        CustomerPrice::create(['customer_id' => $other->id, 'product_type' => 'bags', 'unit_price' => 41]);

        $this->postJson('/api/reference-prices/dealer/apply')->assertOk();

        $this->assertDatabaseMissing('customer_prices', ['customer_id' => $this->dealer->id]);
        $this->assertDatabaseHas('customer_prices', ['customer_id' => $other->id, 'product_type' => 'bags', 'unit_price' => 41]);
    }

    public function test_an_unknown_customer_type_is_not_found(): void
    {
        $this->putJson('/api/reference-prices/wholesale', ['prices' => ['bags' => 1]])->assertNotFound();
        $this->postJson('/api/reference-prices/wholesale/apply')->assertNotFound();
    }
}
