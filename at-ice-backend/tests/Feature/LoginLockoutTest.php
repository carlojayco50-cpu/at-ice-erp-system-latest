<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\LoginLockout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

// Progressive sign-in lockout: 5 wrong passwords in a row lock for 3, 5, 10, 15, 30,
// then 60 minutes (and 60 stays the cap). The server decides, so these call the API.
class LoginLockoutTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'Right-pass-1!';

    protected function setUp(): void
    {
        parent::setUp();

        // the route's per-minute IP limit is its own thing; these tests are about the lockout
        $this->withoutMiddleware(ThrottleRequests::class);
        Cache::flush();
        User::create(['name' => 'Ana', 'email' => 'ana@atice.cloud', 'password' => self::PASSWORD, 'role' => 'admin']);
        User::create(['name' => 'Ben', 'email' => 'ben@atice.cloud', 'password' => self::PASSWORD, 'role' => 'hr']);
    }

    private function login(string $email, string $password, string $ip = '10.0.0.1')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/login', ['email' => $email, 'password' => $password]);
    }

    private function wrong(string $email = 'ana@atice.cloud', int $times = 5, string $ip = '10.0.0.1')
    {
        $last = null;
        for ($i = 0; $i < $times; $i++) {
            $last = $this->login($email, 'wrong', $ip);
        }

        return $last;
    }

    public function test_the_fifth_wrong_password_starts_a_three_minute_lockout(): void
    {
        foreach (range(1, 4) as $i) {
            $this->login('ana@atice.cloud', 'wrong')->assertStatus(401)->assertExactJson(['message' => 'Invalid credentials.']);
        }

        $this->login('ana@atice.cloud', 'wrong')
            ->assertStatus(429)
            ->assertJsonPath('retry_after_seconds', 180)
            ->assertHeader('Retry-After', '180')
            ->assertJsonStructure(['message', 'retry_after_seconds', 'locked_until']);
    }

    public function test_a_correct_password_does_not_get_in_while_locked(): void
    {
        $this->wrong();

        $this->login('ana@atice.cloud', self::PASSWORD)->assertStatus(429);
    }

    public function test_the_lock_counts_down_from_the_servers_clock(): void
    {
        $this->wrong();
        $this->travel(60)->seconds();

        $this->login('ana@atice.cloud', self::PASSWORD)->assertStatus(429)->assertJsonPath('retry_after_seconds', 120);
    }

    public function test_each_lockout_is_longer_up_to_sixty_minutes(): void
    {
        $steps = [180, 300, 600, 900, 1800, 3600, 3600, 3600];

        foreach ($steps as $seconds) {
            $this->wrong('ana@atice.cloud', 4)->assertStatus(401);
            $this->login('ana@atice.cloud', 'wrong')->assertStatus(429)->assertJsonPath('retry_after_seconds', $seconds);
            $this->travel($seconds + 1)->seconds(); // lock over: five more tries are allowed again
        }
    }

    public function test_the_steps_come_from_the_config(): void
    {
        $this->assertSame([180, 300, 600, 900, 1800, 3600], config('atice.login_lockout.steps'));
        $this->assertSame(180, LoginLockout::stepSeconds(1));
        $this->assertSame(3600, LoginLockout::stepSeconds(6));
        $this->assertSame(3600, LoginLockout::stepSeconds(99));
    }

    public function test_an_expired_lock_lets_the_right_password_in_and_starts_over(): void
    {
        $this->wrong();
        $this->travel(181)->seconds();

        $this->login('ana@atice.cloud', self::PASSWORD)->assertOk()->assertJsonPath('role', 'admin');

        // the step count was cleared: the next lockout is 3 minutes again, not 5
        $this->wrong('ana@atice.cloud', 4)->assertStatus(401);
        $this->login('ana@atice.cloud', 'wrong')->assertStatus(429)->assertJsonPath('retry_after_seconds', 180);
    }

    public function test_waiting_alone_does_not_clear_the_step_count(): void
    {
        $this->wrong();
        $this->travel(181)->seconds(); // first lock over, nothing else done

        $this->wrong('ana@atice.cloud', 4)->assertStatus(401);
        $this->login('ana@atice.cloud', 'wrong')->assertStatus(429)->assertJsonPath('retry_after_seconds', 300);
    }

    public function test_the_lock_is_not_lost_between_requests_or_tabs(): void
    {
        $this->wrong();

        // other "tabs" and direct API calls are all just more requests from the same IP
        foreach (range(1, 3) as $i) {
            $this->login('ana@atice.cloud', self::PASSWORD)->assertStatus(429);
        }
    }

    public function test_other_accounts_are_counted_separately(): void
    {
        $this->wrong('ana@atice.cloud');

        $this->login('ben@atice.cloud', self::PASSWORD)->assertOk()->assertJsonPath('role', 'hr');
        $this->login('ana@atice.cloud', self::PASSWORD)->assertStatus(429);
    }

    public function test_a_stranger_on_another_ip_cannot_lock_an_employee_out_of_their_own_computer(): void
    {
        $this->wrong('ana@atice.cloud', 5, '203.0.113.9');

        $this->login('ana@atice.cloud', self::PASSWORD, '10.0.0.1')->assertOk();
    }

    public function test_guessing_one_account_from_many_ips_is_still_stopped(): void
    {
        // 4 tries from each of 5 IPs: no single IP reaches 5, but the account sees 20
        foreach (range(1, 5) as $n) {
            $this->wrong('ana@atice.cloud', 4, "198.51.100.{$n}");
        }

        $this->login('ana@atice.cloud', self::PASSWORD, '10.0.0.1')->assertStatus(429)->assertJsonPath('retry_after_seconds', 900);
        $this->travel(901)->seconds();
        $this->login('ana@atice.cloud', self::PASSWORD, '10.0.0.1')->assertOk();
    }

    public function test_one_ip_trying_many_accounts_is_stopped_but_normal_mistakes_on_a_shared_network_are_not(): void
    {
        // a shared office: 10 people each mistype once
        foreach (range(1, 10) as $n) {
            $this->login("worker{$n}@atice.cloud", 'wrong', '192.0.2.50')->assertStatus(401);
        }
        $this->login('ana@atice.cloud', self::PASSWORD, '192.0.2.50')->assertOk();

        // one machine spraying many emails
        foreach (range(1, 40) as $n) {
            $this->login("guess{$n}@atice.cloud", 'wrong', '192.0.2.99');
        }
        $this->login('ben@atice.cloud', self::PASSWORD, '192.0.2.99')->assertStatus(429)->assertJsonPath('retry_after_seconds', 900);
    }

    public function test_unknown_and_real_emails_get_the_same_replies(): void
    {
        $real = $this->wrong('ana@atice.cloud');
        $unknown = $this->wrong('nobody@atice.cloud');

        $this->assertSame($real->status(), $unknown->status());
        $this->assertSame(array_keys($real->json()), array_keys($unknown->json()));
        $this->assertSame($real->json('retry_after_seconds'), $unknown->json('retry_after_seconds'));
    }

    public function test_the_wrong_password_reply_shows_no_counts(): void
    {
        $this->login('ana@atice.cloud', 'wrong')->assertStatus(401)->assertJsonMissingPath('attempts_remaining');
    }

    public function test_the_email_case_does_not_start_a_fresh_count(): void
    {
        $this->wrong('ana@atice.cloud', 3);
        $this->wrong('ANA@atice.cloud', 1);
        $this->login('Ana@Atice.cloud', 'wrong')->assertStatus(429);
    }

    public function test_each_role_still_signs_in(): void
    {
        foreach ([['admin', null], ['hr', null], ['employee', 'checker'], ['employee', 'maintenance'], ['employee', 'salesman'], ['driver', null], ['customer', null]] as $i => [$role, $sub]) {
            User::create(['name' => "U{$i}", 'email' => "u{$i}@atice.cloud", 'password' => self::PASSWORD, 'role' => $role, 'sub_role' => $sub]);
            $this->login("u{$i}@atice.cloud", self::PASSWORD)->assertOk()->assertJsonPath('role', $role)->assertJsonPath('sub_role', $sub);
        }
    }

    public function test_the_lock_state_expires_by_itself(): void
    {
        $this->wrong();
        $this->travel(2)->days();

        $this->assertSame(0, LoginLockout::secondsLeft('ana@atice.cloud', '10.0.0.1'));
        $this->assertNull(Cache::get('login-lock:pair:'.sha1('ana@atice.cloud').':10.0.0.1'));
    }
}
