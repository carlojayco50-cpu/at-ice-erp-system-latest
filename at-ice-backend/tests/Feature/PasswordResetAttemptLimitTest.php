<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

// The wrong-code limit of "Forgot password?" on the DATABASE cache store, the one
// production uses (docker-compose.yml: CACHE_STORE=database). Cache::increment
// does nothing on that store when the key does not exist yet, so a counter that
// is never created first never counts. The other password tests run on the
// array store, which hides this.
class PasswordResetAttemptLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['cache.default' => 'database']);
        app('cache')->setDefaultDriver('database');
        Cache::flush();
        Mail::fake();
        User::create(['name' => 'Shop', 'email' => 'shop@atice.cloud', 'password' => 'OldPass123!', 'role' => 'customer']);
    }

    private function requestCode(): string
    {
        $this->postJson('/api/forgot-password', ['email' => 'shop@atice.cloud'])->assertOk();
        $code = null;
        Mail::assertSent(PasswordResetCode::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    private function wrongCode(string $right): string
    {
        return $right === '000000' ? '111111' : '000000';
    }

    private function verify(string $code)
    {
        return $this->postJson('/api/verify-reset-code', ['email' => 'shop@atice.cloud', 'code' => $code]);
    }

    private function codeStored(): bool
    {
        return DB::table('password_reset_tokens')->where('email', 'shop@atice.cloud')->exists();
    }

    public function test_the_database_cache_store_is_really_in_use(): void
    {
        $this->assertSame('database', config('cache.default'));
        $this->assertSame('database', app('cache')->getDefaultDriver());
    }

    public function test_five_wrong_tries_cancel_the_code_even_for_the_right_code_afterwards(): void
    {
        $code = $this->requestCode();
        $wrong = $this->wrongCode($code);

        for ($i = 1; $i <= 4; $i++) {
            $this->verify($wrong)->assertUnprocessable();
            $this->assertTrue($this->codeStored(), "code must still be valid after wrong try {$i}");
        }

        $this->verify($wrong)->assertUnprocessable();
        $this->assertFalse($this->codeStored(), 'the 5th wrong try cancels the code');

        // The right code no longer works either.
        $this->verify($code)->assertUnprocessable();
    }

    public function test_asking_for_a_new_code_does_not_reset_the_wrong_tries(): void
    {
        $first = $this->requestCode();
        for ($i = 0; $i < 3; $i++) {
            $this->verify($this->wrongCode($first))->assertUnprocessable();
        }

        // A new code is requested after 3 wrong tries.
        Mail::fake();
        $second = $this->requestCode();

        // 2 more wrong tries are the 4th and 5th in total: locked.
        $this->verify($this->wrongCode($second))->assertUnprocessable();
        $this->assertTrue($this->codeStored(), 'still valid after 4 wrong tries in total');
        $this->verify($this->wrongCode($second))->assertUnprocessable();
        $this->assertFalse($this->codeStored(), 'the 5th wrong try in total cancels it, a new code did not reset the count');

        $this->verify($second)->assertUnprocessable();
    }

    public function test_while_locked_no_new_code_is_made_or_sent_and_the_answer_is_the_same(): void
    {
        $code = $this->requestCode();
        for ($i = 0; $i < 5; $i++) {
            $this->verify($this->wrongCode($code))->assertUnprocessable();
        }

        Mail::fake();
        $reply = $this->postJson('/api/forgot-password', ['email' => 'shop@atice.cloud'])->assertOk()->json('message');

        $this->assertSame('If that email has an account, a 6-digit code was sent to it. Check your inbox and spam folder.', $reply);
        Mail::assertNotSent(PasswordResetCode::class);
        $this->assertFalse($this->codeStored());
    }

    public function test_the_lock_ends_after_15_minutes(): void
    {
        $code = $this->requestCode();
        for ($i = 0; $i < 5; $i++) {
            $this->verify($this->wrongCode($code))->assertUnprocessable();
        }

        $this->travel(16)->minutes();

        Mail::fake();
        $fresh = $this->requestCode();
        $this->verify($fresh)->assertOk();
    }

    public function test_a_right_code_still_works_before_the_limit_and_clears_the_count(): void
    {
        $code = $this->requestCode();
        $this->verify($this->wrongCode($code))->assertUnprocessable();

        $this->postJson('/api/reset-password', [
            'email' => 'shop@atice.cloud', 'code' => $code,
            'password' => 'NewPass123!', 'password_confirmation' => 'NewPass123!',
        ])->assertOk();

        // The count is cleared with a successful reset: a later code starts at zero.
        Mail::fake();
        $again = $this->requestCode();
        for ($i = 0; $i < 4; $i++) {
            $this->verify($this->wrongCode($again))->assertUnprocessable();
        }
        $this->assertTrue($this->codeStored());
        $this->verify($again)->assertOk();
    }
}
