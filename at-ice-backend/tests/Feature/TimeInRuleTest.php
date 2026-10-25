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

    private int $made = 0;

    private function user(string $role, ?string $subRole = null): User
    {
        $user = User::create(['name' => ucfirst($subRole ?? $role), 'email' => ($subRole ?? $role).(++$this->made).'@atice.cloud', 'password' => 'secret-password', 'role' => $role, 'sub_role' => $subRole]);
        Employee::create(['user_id' => $user->id, 'employee_id' => sprintf('EMP-%04d', 10 + $user->id), 'first_name' => $user->name, 'last_name' => 'Cruz', 'position' => $user->name, 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true]);

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

    // Not timed in yet must never lock anyone out of their own account: the forced
    // first-login password change, sign out and forgot password all stay open.
    public function test_account_routes_stay_open_before_time_in(): void
    {
        foreach ([['employee', 'checker'], ['employee', 'salesman'], ['employee', 'maintenance'], ['driver', null]] as [$role, $sub]) {
            $user = $this->user($role, $sub);
            $user->forceFill(['must_change_password' => true])->save();
            Sanctum::actingAs($user);

            $this->putJson('/api/change-password', ['password' => 'Brand-new-pass1!', 'password_confirmation' => 'Brand-new-pass1!'])
                ->assertOk();
            $this->assertFalse($user->fresh()->must_change_password);
            $this->postJson('/api/logout-others')->assertStatus(200);
            $this->postJson('/api/logout')->assertOk();
        }

        $user = $this->user('driver');
        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertStatus(200);
    }

    public function test_only_the_save_routes_of_the_four_roles_use_the_time_in_middleware(): void
    {
        foreach (['api/change-password', 'api/logout', 'api/logout-others', 'api/forgot-password', 'api/verify-reset-code', 'api/reset-password'] as $uri) {
            $route = collect(app('router')->getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === $uri);
            $this->assertNotNull($route, $uri);
            $this->assertNotContains('timed.in', app('router')->gatherRouteMiddleware($route), "{$uri} must stay open before time in");
        }
    }

    // Admin and HR are never blocked by the time-in rule.
    public function test_admin_and_hr_are_not_subject_to_the_time_in_rule(): void
    {
        foreach (['admin', 'hr'] as $role) {
            Sanctum::actingAs(User::create(['name' => ucfirst($role), 'email' => "{$role}@atice.cloud", 'password' => 'secret-password', 'role' => $role]));
            $this->assertNull($this->postJson('/api/holidays', [])->json('needs_time_in'), "{$role} must not need a Time In");
        }
    }
}
