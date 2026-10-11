<?php

namespace Tests\Feature;

use App\Mail\AccountCredentials;
use App\Mail\PasswordResetCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_PASSWORD = 'NewPass123!';

    private function customer(): User
    {
        return User::create(['name' => 'Shop', 'email' => 'shop@atice.cloud', 'password' => 'OldPass123!', 'role' => 'customer']);
    }

    // Sends the code and returns it, read from the faked email.
    private function requestCode(string $email): string
    {
        $this->postJson('/api/forgot-password', ['email' => $email])->assertOk();
        $code = null;
        Mail::assertSent(PasswordResetCode::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    public function test_forgot_password_emails_a_code_that_sets_a_new_password(): void
    {
        Mail::fake();
        $user = $this->customer();
        $user->createToken('phone');

        $code = $this->requestCode('Shop@Atice.cloud ');
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);

        $this->postJson('/api/reset-password', [
            'email' => 'shop@atice.cloud', 'code' => $code,
            'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $fresh = $user->fresh();
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $fresh->password));
        $this->assertFalse($fresh->must_change_password);
        $this->assertSame(0, $fresh->tokens()->count());

        // The code works only once.
        $this->postJson('/api/reset-password', [
            'email' => 'shop@atice.cloud', 'code' => $code,
            'password' => 'Another123!', 'password_confirmation' => 'Another123!',
        ])->assertUnprocessable();
    }

    public function test_the_code_is_checked_before_the_new_password(): void
    {
        Mail::fake();
        $this->customer();
        $code = $this->requestCode('shop@atice.cloud');
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/verify-reset-code', ['email' => 'shop@atice.cloud', 'code' => $wrong])->assertUnprocessable();
        $this->postJson('/api/verify-reset-code', ['email' => 'shop@atice.cloud', 'code' => $code])->assertOk();

        // checking does not use up the code
        $this->postJson('/api/reset-password', [
            'email' => 'shop@atice.cloud', 'code' => $code,
            'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();
    }

    public function test_unknown_email_gets_the_same_answer_and_no_email(): void
    {
        Mail::fake();
        $this->postJson('/api/forgot-password', ['email' => 'nobody@atice.cloud'])
            ->assertOk()->assertJsonStructure(['message']);
        Mail::assertNothingSent();
    }

    public function test_wrong_code_and_expired_code_are_refused_and_five_wrong_tries_cancel_it(): void
    {
        Mail::fake();
        $this->customer();
        $code = $this->requestCode('shop@atice.cloud');
        $wrong = $code === '000000' ? '111111' : '000000';
        $body = fn ($c) => ['email' => 'shop@atice.cloud', 'code' => $c, 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/reset-password', $body($wrong))->assertUnprocessable();
        }
        // cancelled after 5 wrong tries, even with the right code
        $this->postJson('/api/reset-password', $body($code))->assertUnprocessable();

        // a fresh code expires after 15 minutes
        Mail::fake();
        $code = $this->requestCode('shop@atice.cloud');
        $this->travel(16)->minutes();
        $this->postJson('/api/reset-password', $body($code))->assertUnprocessable();
    }

    public function test_new_customer_gets_the_login_by_email(): void
    {
        Mail::fake();
        config(['mail.default' => 'smtp']); // a real mailer is set up
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        Sanctum::actingAs($admin);

        $res = $this->postJson('/api/customers', [
            'name' => 'Alfamart Amparo', 'email' => 'alfamart@gmail.com', 'mop' => 'cash',
            'contact_person' => 'Juan Dela Cruz', 'contact_number' => '+639171234567',
            'street' => 'Makabud Street', 'barangay' => 'Barangay 183', 'city' => 'Caloocan', 'province' => 'Metro Manila',
            'latitude' => 14.7482688, 'longitude' => 121.0796465,
        ])->assertCreated();

        $this->assertSame('sent', $res->json('login.emailed'));
        Mail::assertSent(AccountCredentials::class, fn ($mail) => $mail->hasTo('alfamart@gmail.com')
            && $mail->password === $res->json('login.password'));
    }

    public function test_with_mail_set_to_log_admin_is_told_nothing_was_sent(): void
    {
        Mail::fake();
        config(['mail.default' => 'log']);
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));

        $res = $this->postJson('/api/customers', [
            'name' => 'Alfamart Amparo', 'email' => 'alfamart@gmail.com', 'mop' => 'cash',
            'contact_person' => 'Juan Dela Cruz', 'contact_number' => '+639171234567',
            'street' => 'Makabud Street', 'barangay' => 'Barangay 183', 'city' => 'Caloocan', 'province' => 'Metro Manila',
            'latitude' => 14.7482688, 'longitude' => 121.0796465,
        ])->assertCreated();

        $this->assertSame('off', $res->json('login.emailed'));
        Mail::assertNothingSent();
    }

    public function test_a_customer_email_whose_account_does_not_exist_is_not_saved(): void
    {
        Mail::fake();
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));

        $this->postJson('/api/customers', [
            'name' => 'Alfamart Amparo', 'email' => 'no-such-user-123@gmail.com', 'mop' => 'cash',
            'contact_person' => 'Juan Dela Cruz', 'contact_number' => '+639171234567',
            'street' => 'Makabud Street', 'barangay' => 'Barangay 183', 'city' => 'Caloocan', 'province' => 'Metro Manila',
            'latitude' => 14.7482688, 'longitude' => 121.0796465,
        ])->assertUnprocessable()->assertJsonValidationErrors(['email' => 'does not exist']);

        $this->assertDatabaseCount('customers', 0);
        $this->assertDatabaseMissing('users', ['email' => 'no-such-user-123@gmail.com']);
        $this->getJson('/api/customers/check-email?email=no-such-user-123@gmail.com')->assertOk()->assertJson(['result' => 'invalid']);
        Mail::assertNothingSent();
    }

    public function test_a_company_address_is_not_a_customer_email(): void
    {
        Mail::fake();
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));

        $this->postJson('/api/customers', [
            'name' => 'Alfamart Amparo', 'email' => 'Alfamart@ATICE.cloud', 'mop' => 'cash',
            'contact_person' => 'Juan Dela Cruz', 'contact_number' => '+639171234567',
            'street' => 'Makabud Street', 'barangay' => 'Barangay 183', 'city' => 'Caloocan', 'province' => 'Metro Manila',
            'latitude' => 14.7482688, 'longitude' => 121.0796465,
        ])->assertUnprocessable()->assertJsonValidationErrors(['email' => 'not an @atice.cloud address']);

        $this->assertDatabaseCount('customers', 0);
        Mail::assertNothingSent();
    }
}
