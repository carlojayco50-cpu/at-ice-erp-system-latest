<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Project;
use App\Models\StockOutRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProjectBoardTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_runs_the_board_and_maintenance_files_requests_for_a_project(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $maint = User::create(['name' => 'Mario', 'email' => 'mario.0002@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'maintenance']);
        $grease = Product::create(['product_code' => 'SUP-001', 'name' => 'Grease', 'unit' => 'can', 'unit_price' => 150, 'current_stock' => 20, 'minimum_stock' => 2, 'is_active' => true]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/projects', ['name' => '', 'due_date' => '2026-10-01', 'start_date' => '2026-10-05'])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'due_date']);
        $id = $this->postJson('/api/projects', ['name' => 'Ice plant compressor repair', 'status' => 'working', 'priority' => 'high', 'budget' => 1000])
            ->assertCreated()->json('id');

        Sanctum::actingAs($maint);
        $this->getJson('/api/project-options')->assertOk()->assertJsonPath('0.name', 'Ice plant compressor repair');
        $req = $this->postJson('/api/stock-out-requests', ['product_id' => $grease->id, 'quantity' => 2, 'purpose' => 'Compressor', 'project_id' => $id])
            ->assertCreated()->json('request.id');
        $this->assertSame($id, StockOutRequest::find($req)->project_id);

        // Admin approves and releases: the board counts it as used, at the item's price.
        Sanctum::actingAs($admin);
        $this->putJson("/api/stock-out-requests/{$req}/approve")->assertOk();
        $this->putJson("/api/stock-out-requests/{$req}/release")->assertOk();
        $board = collect($this->getJson('/api/projects')->assertOk()->json())->firstWhere('id', $id);
        $this->assertSame(1, $board['requests_released']);
        $this->assertEquals(300, $board['materials_cost']);
        $this->assertEquals(700, $board['budget_left']);

        // A finished project is no longer offered to Maintenance.
        $this->putJson("/api/projects/{$id}", ['status' => 'done'])->assertOk()->assertJsonPath('progress', 100);
        Sanctum::actingAs($maint);
        $this->getJson('/api/project-options')->assertOk()->assertJsonCount(0);
        $this->postJson('/api/stock-out-requests', ['product_id' => $grease->id, 'quantity' => 1, 'purpose' => 'x', 'project_id' => $id])
            ->assertUnprocessable()->assertJsonValidationErrors('project_id');

        // Only Admin manages the board.
        $this->postJson('/api/projects', ['name' => 'Nope'])->assertForbidden();
        $this->assertSame(1, Project::count());
    }

    public function test_a_project_has_a_location_and_room_for_a_geofence(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $id = $this->postJson('/api/projects', ['name' => 'Cold room', 'location' => 'Blk 5 Lot 2, Muzon, San Jose del Monte, Bulacan'])
            ->assertCreated()->json('id');
        $this->assertSame('Blk 5 Lot 2, Muzon, San Jose del Monte, Bulacan', \App\Models\Project::find($id)->location);
        $this->postJson('/api/projects', ['name' => 'Pin', 'latitude' => 14.8])->assertStatus(422); // latitude needs longitude
    }
}
