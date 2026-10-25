<?php

namespace Tests;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Services\EmailVerifier;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tests never ask real mail servers whether an account exists:
        // an address containing "no-such-user" does not exist, all others do.
        $this->app->instance(EmailVerifier::class, new class extends EmailVerifier
        {
            public function check(string $email): string
            {
                return str_contains($email, 'no-such-user') ? 'invalid' : 'valid';
            }
        });
    }

    // The user has an employee record and timed in a few minutes ago: an
    // employee or Driver saves nothing until then (EnsureTimedIn).
    protected function timedIn(User $user): User
    {
        $emp = $user->employee ?? Employee::create([
            'user_id' => $user->id, 'employee_id' => sprintf('EMP-%04d', 8000 + $user->id), 'first_name' => $user->name, 'last_name' => 'Test',
            'position' => ucfirst((string) ($user->sub_role ?: $user->role)), 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true,
        ]);
        $now = now(config('atice.timezone')); // kiosk times are in the business zone, whatever APP_TIMEZONE is
        Attendance::create(['employee_id' => $emp->id, 'date' => $now->toDateString(), 'time_in' => $now->copy()->subMinutes(5)->format('H:i:s'), 'status' => 'present']);

        return $user->fresh();
    }
}
