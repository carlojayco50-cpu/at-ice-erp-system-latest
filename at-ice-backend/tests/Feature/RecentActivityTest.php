<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecentActivityTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_notifications_list_actions_by_others_with_their_module(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $hr = User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']);

        // something done by another user reaches Admin
        $this->actingAs($hr);
        Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);

        // Admin's own action is not listed back to Admin
        $this->actingAs($admin);
        Customer::create(['name' => 'Own Shop', 'customer_code' => 'CUST-OWN-001', 'branch_code' => 'OWN-SJDM-001', 'is_active' => true]);

        Sanctum::actingAs($admin);
        $list = collect($this->getJson('/api/bi/recent-activity')->assertOk()->json());

        $this->assertTrue($list->contains(fn ($n) => $n['module'] === 'customers' && str_contains($n['body'], 'Alfamart Muzon')));
        $this->assertFalse($list->contains(fn ($n) => str_contains($n['body'], 'Own Shop')));
    }
}
