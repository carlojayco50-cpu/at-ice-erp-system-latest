<?php

namespace Tests\Feature;

use Tests\TestCase;

class ValidationMessagesTest extends TestCase
{
    public function test_laravel_messages_still_load_next_to_the_custom_email_message(): void
    {
        $res = $this->postJson('/api/login', ['email' => 'not-an-email', 'password' => ['not', 'a', 'string']])
            ->assertUnprocessable();

        $this->assertStringStartsWith('Enter a real email address.', $res->json('errors.email.0'));
        $this->assertSame('The password field must be a string.', $res->json('errors.password.0'));
    }
}
