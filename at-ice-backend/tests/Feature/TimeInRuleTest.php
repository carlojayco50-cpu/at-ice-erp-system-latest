<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Like the Checker, the Salesman, Maintenance and Driver save nothing until
// they have timed in at the kiosk today (owner, 2026-10-20); reading works.
class TimeInRuleTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, ?string $subRole = null): User
    {
        $user = User::create(['name' => ucfirst($subRole ?? $role), 'email' => ($subRole ?? $role).'@atice.cloud', 'password' => 'secret-password', 'role' => $role, 'sub_role' => $subRole]);
        Employee::create(['user_id' => $user->id, 'employee_id' => 'EMP-00'.(10 + $user->id), 'first_name' => $user->name, 'last_name' => 'Cruz', 'position' => $user->name, 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true]);

        return $user;
    }

    public function test_salesman_maintenance_and_driver_cannot_save_before_time_in(): void
    {
        Sanctum::actingAs($this->user('employee', 'salesman'));
        $this->postJson('/api/delivery-confirmation', [])->assertForbidden()->assertJsonPath('needs_time_in', true);
        $this->getJson('/api/my-deliveries')->assertOk();

        Sanctum::actingAs($this->user('employee', 'maintenance'));
        $this->postJson('/api/stock-out-requests', [])->assertForbidden()->assertJsonPath('needs_time_in', true);
        $this->postJson('/api/my-projects', [])->assertForbidden()->assertJsonPath('needs_time_in', true);
        $this->getJson('/api/my-projects')->assertOk();

        Sanctum::actingAs($this->user('driver'));
        $this->patchJson('/api/driver/deliveries/1/status', ['status' => 'in_transit'])->assertForbidden()->assertJsonPath('needs_time_in', true);
        $this->getJson('/api/driver/deliveries')->assertOk();
    }

    public function test_once_timed_in_the_request_goes_through_to_its_own_checks(): void
    {
        Sanctum::actingAs($this->timedIn($this->user('employee', 'maintenance')));
        $this->postJson('/api/stock-out-requests', [])->assertUnprocessable();
    }
}
