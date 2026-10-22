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

        // Maintenance adds the project (name, description, location); Admin cannot
        Sanctum::actingAs($maint = $this->timedIn($maint));
        $this->postJson('/api/my-projects', ['name' => ''])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'description', 'location']);
        $id = $this->postJson('/api/my-projects', ['name' => 'Ice plant compressor repair', 'description' => 'Replace the compressor belt', 'location' => 'Plant 1'])
            ->assertCreated()->json('id');
        $this->assertSame('planned', Project::find($id)->status);

        $this->getJson('/api/project-options')->assertOk()->assertJsonPath('0.name', 'Ice plant compressor repair');
        $req = $this->postJson('/api/stock-out-requests', ['product_id' => $grease->id, 'quantity' => 2, 'purpose' => 'Compressor', 'project_id' => $id])
            ->assertCreated()->json('request.id');
        $this->assertSame($id, StockOutRequest::find($req)->project_id);

        // Admin approves and releases: the board counts it as used, at the item's price.
        Sanctum::actingAs($admin);
        $this->putJson("/api/projects/{$id}", ['status' => 'working', 'priority' => 'high', 'budget' => 1000])->assertOk();
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

        // Admin edits the board fields but cannot add a project
        Sanctum::actingAs($admin);
        $this->putJson("/api/projects/{$id}", ['status' => 'working', 'priority' => 'high', 'budget' => 1000])->assertOk();
        $this->postJson('/api/my-projects', ['name' => 'Nope', 'description' => 'x', 'location' => 'y'])->assertForbidden();
        $this->assertSame(1, Project::count());
    }

    public function test_a_project_has_a_location_and_room_for_a_geofence(): void
    {
        Sanctum::actingAs($this->timedIn(User::factory()->create(['role' => 'employee', 'sub_role' => 'maintenance'])));
        $id = $this->postJson('/api/my-projects', ['name' => 'Cold room', 'description' => 'New cold room', 'location' => 'Blk 5 Lot 2, Muzon, San Jose del Monte, Bulacan'])
            ->assertCreated()->json('id');
        $this->assertSame('Blk 5 Lot 2, Muzon, San Jose del Monte, Bulacan', \App\Models\Project::find($id)->location);
        $this->postJson('/api/my-projects', ['name' => 'Pin', 'description' => 'x', 'location' => 'y', 'latitude' => 14.8])->assertStatus(422); // latitude needs longitude
    }
}
