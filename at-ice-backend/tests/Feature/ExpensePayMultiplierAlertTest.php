<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\InventoryAlert;
use App\Models\PayMultiplier;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpensePayMultiplierAlertTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_records_an_expense_and_the_year_summary_counts_it(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/bi/expenses', ['category' => 'fuel', 'amount' => 1500.50, 'expense_date' => '2026-10-05', 'notes' => 'Diesel'])
            ->assertCreated();
        $this->postJson('/api/bi/expenses', ['category' => 'water', 'amount' => 200, 'expense_date' => '2026-10-20'])
            ->assertCreated();

        $october = collect($this->getJson('/api/bi/expenses?year=2026')->assertOk()->json('monthly_chart'))->firstWhere('month', 10);
        $this->assertEquals(1500.50, $october['fuel']);
        $this->assertEquals(200, $october['water']);
        $this->assertEquals(1700.50, $october['total']);
    }

    public function test_an_expense_needs_a_known_category_and_an_amount(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/bi/expenses', ['category' => 'rent', 'amount' => 100, 'expense_date' => '2026-10-05'])->assertUnprocessable();
        $this->postJson('/api/bi/expenses', ['category' => 'fuel', 'amount' => -5, 'expense_date' => '2026-10-05'])->assertUnprocessable();
    }

    public function test_admin_sets_a_holiday_or_overtime_rate_from_a_date(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/pay-multipliers', ['key' => 'OT_ORDINARY', 'value' => 1.25, 'effective_date' => '2026-01-01'])
            ->assertOk();

        $this->assertSame(1.25, PayMultiplier::rate('OT_ORDINARY', '2026-06-01'));
        $this->postJson('/api/pay-multipliers', ['key' => 'NOT_A_RATE', 'value' => 2, 'effective_date' => '2026-01-01'])
            ->assertUnprocessable();
    }

    public function test_a_checker_resolves_a_low_stock_alert_after_time_in(): void
    {
        $product = Product::create(['product_code' => 'ICE-001', 'name' => 'Sack Ice', 'unit' => 'sack', 'current_stock' => 2, 'minimum_stock' => 5]);
        $alert = InventoryAlert::create(['product_id' => $product->id, 'alert_type' => 'low_stock', 'message' => 'Low', 'is_resolved' => false]);

        $checker = User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']);
        $emp = Employee::create([
            'user_id' => $checker->id, 'employee_id' => 'EMP-0100', 'first_name' => 'Check', 'last_name' => 'Er',
            'position' => 'Checker', 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true,
        ]);
        Attendance::create(['employee_id' => $emp->id, 'date' => now()->toDateString(), 'time_in' => now()->subMinutes(5)->format('H:i:s'), 'status' => 'present']);

        Sanctum::actingAs($checker);
        $this->putJson("/api/inventory-alerts/{$alert->id}/resolve")->assertOk();

        $this->assertTrue((bool) $alert->fresh()->is_resolved);
        $this->assertNotNull($alert->fresh()->resolved_at);
    }
}
