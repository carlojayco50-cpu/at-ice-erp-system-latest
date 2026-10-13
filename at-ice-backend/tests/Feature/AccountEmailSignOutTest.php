<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Changing a login email signs that account out of all its sessions.
class AccountEmailSignOutTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $email): User
    {
        return User::create(['name' => ucfirst($role), 'email' => $email, 'password' => 'secret-password', 'role' => $role]);
    }

    public function test_changing_the_login_email_ends_every_session_of_that_account(): void
    {
        $hr = $this->user('hr', 'hr@atice.cloud');
        $employee = $this->user('employee', 'wrong@atice.cloud');
        $phone = $employee->createToken('phone')->plainTextToken;
        $laptop = $employee->createToken('laptop')->plainTextToken;
        $this->assertSame(2, $employee->tokens()->count());

        // both tokens work before the change
        $this->withToken($phone)->getJson('/api/me')->assertOk();
        $this->app['auth']->forgetGuards();

        Sanctum::actingAs($hr);
        $this->putJson("/api/accounts/{$employee->id}/email", ['email' => 'right@atice.cloud'])->assertOk();

        $this->assertSame(0, $employee->tokens()->count());

        // and neither works afterwards
        $this->app['auth']->forgetGuards();
        $this->withToken($phone)->getJson('/api/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withToken($laptop)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_the_person_making_the_change_stays_signed_in_and_other_accounts_are_untouched(): void
    {
        $admin = $this->user('admin', 'admin@atice.cloud');
        $adminToken = $admin->createToken('admin')->plainTextToken;
        $customer = $this->user('customer', 'shop@atice.cloud');
        $other = $this->user('customer', 'other@atice.cloud');
        $other->createToken('other');
        $customer->createToken('shop');

        Sanctum::actingAs($admin);
        $this->putJson("/api/accounts/{$customer->id}/email", ['email' => 'newshop@gmail.com'])->assertOk();

        $this->assertSame(0, $customer->tokens()->count());
        $this->assertSame(1, $other->tokens()->count());
        $this->assertSame(1, $admin->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($adminToken)->getJson('/api/me')->assertOk();
    }

    public function test_a_refused_change_signs_nobody_out(): void
    {
        $hr = $this->user('hr', 'hr@atice.cloud');
        $customer = $this->user('customer', 'shop@atice.cloud');
        $customer->createToken('shop');

        Sanctum::actingAs($hr);
        $this->putJson("/api/accounts/{$customer->id}/email", ['email' => 'x@atice.cloud'])->assertForbidden();

        $this->assertSame(1, $customer->tokens()->count());
    }
}
