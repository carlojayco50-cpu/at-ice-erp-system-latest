<?php

namespace Tests;

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
}
