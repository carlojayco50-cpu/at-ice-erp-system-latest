<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $email): User
    {
        return User::create(['name' => ucfirst($role), 'email' => $email, 'password' => 'secret-password', 'role' => $role]);
    }

    public function test_admin_fixes_a_customer_login_and_the_contact_email_follows(): void
    {
        $admin = $this->user('admin', 'admin@atice.cloud');
        $login = $this->user('customer', 'jonathanthan@gmail');
        $customer = Customer::create(['user_id' => $login->id, 'name' => 'Jonathan Store', 'email' => 'jonathanthan@gmail', 'customer_code' => 'C-1', 'branch_code' => 'B-1']);

        Sanctum::actingAs($admin);
        $this->putJson("/api/accounts/{$login->id}/email", ['email' => ' Jonathanthan@Gmail.com '])
            ->assertOk()->assertJson(['email' => 'jonathanthan@gmail.com']);

        $this->assertSame('jonathanthan@gmail.com', $login->fresh()->email);
        $this->assertSame('jonathanthan@gmail.com', $customer->fresh()->email);
    }

    public function test_hr_can_fix_an_employee_but_not_a_customer_or_another_hr(): void
    {
        $hr = $this->user('hr', 'hr@atice.cloud');
        $employee = $this->user('employee', 'wrong@atice.cloud');
        $customer = $this->user('customer', 'shop@atice.cloud');
        $otherHr = $this->user('hr', 'hr2@atice.cloud');

        Sanctum::actingAs($hr);
        $this->putJson("/api/accounts/{$employee->id}/email", ['email' => 'right@atice.cloud'])->assertOk();
        $this->putJson("/api/accounts/{$customer->id}/email", ['email' => 'x@atice.cloud'])->assertForbidden();
        $this->putJson("/api/accounts/{$otherHr->id}/email", ['email' => 'y@atice.cloud'])->assertForbidden();
    }

    public function test_lower_roles_and_admin_targets_are_refused(): void
    {
        $admin = $this->user('admin', 'admin@atice.cloud');
        $otherAdmin = $this->user('admin', 'admin2@atice.cloud');
        $driver = $this->user('driver', 'driver@atice.cloud');
        $employee = $this->user('employee', 'emp@atice.cloud');

        Sanctum::actingAs($admin);
        $this->putJson("/api/accounts/{$otherAdmin->id}/email", ['email' => 'z@atice.cloud'])->assertForbidden();

        Sanctum::actingAs($driver);
        $this->putJson("/api/accounts/{$employee->id}/email", ['email' => 'z@atice.cloud'])->assertForbidden();
    }

    public function test_email_must_be_valid_and_free(): void
    {
        $admin = $this->user('admin', 'admin@atice.cloud');
        $a = $this->user('employee', 'a@atice.cloud');
        $this->user('employee', 'taken@atice.cloud');

        Sanctum::actingAs($admin);
        $this->putJson("/api/accounts/{$a->id}/email", ['email' => 'not-an-email'])->assertUnprocessable();
        $this->putJson("/api/accounts/{$a->id}/email", ['email' => 'jonathanthan@gmail'])->assertUnprocessable(); // no .com
        $this->putJson("/api/accounts/{$a->id}/email", ['email' => 'jonathanthan@gmail.comsdada'])->assertUnprocessable(); // no such domain
        $this->putJson("/api/accounts/{$a->id}/email", ['email' => 'taken@atice.cloud'])->assertUnprocessable();
        $this->putJson("/api/accounts/{$a->id}/email", ['email' => 'a@atice.cloud'])->assertOk();
    }
}
