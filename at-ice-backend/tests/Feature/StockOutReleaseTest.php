<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockOutRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockOutReleaseTest extends TestCase
{
    use RefreshDatabase;

    private User $maintenance;

    private User $admin;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maintenance = User::create(['name' => 'Maint', 'email' => 'maintenance@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'maintenance']);
        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $this->product = Product::create(['product_code' => 'SUP-0001', 'name' => 'Brake Pad', 'unit' => 'pc', 'current_stock' => 10, 'minimum_stock' => 3]);
    }

    private function request(int $quantity)
    {
        Sanctum::actingAs($this->maintenance);

        return $this->postJson('/api/stock-out-requests', ['product_id' => $this->product->id, 'quantity' => $quantity, 'purpose' => 'Truck 2 brakes']);
    }

    public function test_maintenance_requests_an_inventory_item_and_sees_the_list(): void
    {
        Sanctum::actingAs($this->maintenance);
        $this->getJson('/api/stock-out-items')->assertOk()->assertJsonPath('0.name', 'Brake Pad');

        $this->postJson('/api/stock-out-requests', ['item_name' => 'Anything', 'quantity' => 1, 'purpose' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->request(11)->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->request(4)->assertCreated()->assertJsonPath('request.item_name', 'Brake Pad');
    }

    public function test_release_deducts_the_stock_once_and_records_the_stock_out(): void
    {
        $id = $this->request(8)->json('request.id');

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/stock-out-requests/{$id}/approve")->assertOk();
        $this->putJson("/api/stock-out-requests/{$id}/release")->assertOk()->assertJsonPath('message', 'Item released and stock updated.');
        $this->putJson("/api/stock-out-requests/{$id}/release")->assertUnprocessable();

        $this->assertSame(2, (int) $this->product->fresh()->current_stock);
        $request = StockOutRequest::find($id);
        $this->assertSame('released', $request->status);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $request->stock_movement_id, 'product_id' => $this->product->id, 'type' => 'stock_out',
            'quantity' => 8, 'stock_before' => 10, 'stock_after' => 2, 'status' => 'confirmed', 'confirmed_by' => $this->admin->id,
        ]);
        // 2 left, minimum 3: low-stock alert
        $this->assertDatabaseHas('inventory_alerts', ['product_id' => $this->product->id, 'is_resolved' => false]);
    }

    public function test_release_is_refused_when_the_stock_ran_out_meanwhile(): void
    {
        $id = $this->request(8)->json('request.id');
        $this->product->update(['current_stock' => 5]);

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/stock-out-requests/{$id}/approve")->assertOk();
        $this->putJson("/api/stock-out-requests/{$id}/release")->assertUnprocessable();

        $this->assertSame(5, (int) $this->product->fresh()->current_stock);
        $this->assertSame('approved', StockOutRequest::find($id)->status);
    }

    public function test_an_older_free_text_request_is_released_without_a_stock_change(): void
    {
        $old = StockOutRequest::create(['requested_by' => $this->maintenance->id, 'item_name' => 'Fan Belt', 'quantity' => 1, 'purpose' => 'x', 'status' => 'approved']);

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/stock-out-requests/{$old->id}/release")->assertOk();

        $this->assertSame('released', $old->fresh()->status);
        $this->assertNull($old->fresh()->stock_movement_id);
        $this->assertSame(10, (int) $this->product->fresh()->current_stock);
    }
}
