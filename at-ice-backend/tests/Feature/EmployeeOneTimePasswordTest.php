<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LiveEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The password of a new employee account is random, shown to HR once, and must
// be changed on first login. It used to be built from the last name and the phone.
class EmployeeOneTimePasswordTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'first_name' => 'Carlo', 'last_name' => 'Jayco', 'position' => 'Checker',
            'phone' => '09171234550',
            'street' => 'Quirino Highway', 'barangay' => 'Muzon', 'city' => 'San Jose del Monte', 'province' => 'Bulacan',
            'daily_rate' => 0, 'date_hired' => now()->subDay()->toDateString(),
            'shift' => 'day', 'employment_type' => 'regular',
        ];
    }

    private function createEmployee(array $overrides = [])
    {
        return $this->postJson('/api/employees', $this->payload($overrides))->assertCreated();
    }

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
    }

    public function test_the_password_is_random_strong_and_not_built_from_the_employee(): void
    {
        $password = $this->createEmployee()->json('password');

        $this->assertSame(12, strlen($password));
        $this->assertMatchesRegularExpression('/[A-Z]/', $password);
        $this->assertMatchesRegularExpression('/[a-z]/', $password);
        $this->assertMatchesRegularExpression('/\d/', $password);
        $this->assertMatchesRegularExpression('/[^A-Za-z0-9]/', $password);

        // the old pattern: last name + last two digits of the phone + "!"
        $this->assertNotSame('Jayco50!', $password);
        $this->assertStringNotContainsStringIgnoringCase('jayco', $password);
    }

    public function test_every_account_gets_a_different_password(): void
    {
        $seen = [];
        foreach (range(1, 8) as $i) {
            $seen[] = $this->createEmployee([
                'first_name' => "Emp{$i}", 'last_name' => 'Jayco', 'phone' => '09171234550',
            ])->json('password');
        }

        $this->assertCount(8, array_unique($seen), 'same name and phone, still different passwords');
    }

    public function test_the_account_works_with_it_and_must_change_it_on_first_login(): void
    {
        $res = $this->createEmployee();

        $user = User::where('email', $res->json('email'))->first();
        $this->assertTrue(Hash::check($res->json('password'), $user->password));
        $this->assertTrue($user->must_change_password);
        $this->assertNotSame($res->json('password'), $user->password, 'stored hashed, never plain');

        $this->app['auth']->forgetGuards();
        $login = $this->postJson('/api/login', ['email' => $res->json('email'), 'password' => $res->json('password')])
            ->assertOk()->json();
        $this->assertTrue($login['must_change_password']);

        // every other route is blocked until it is changed
        $this->app['auth']->forgetGuards();
        $this->withToken($login['token'])->getJson('/api/my-leave-requests')->assertForbidden()
            ->assertJsonPath('code', 'password_change_required');
    }

    public function test_the_password_is_returned_only_once_in_the_create_response(): void
    {
        Mail::fake();
        $res = $this->createEmployee();
        $password = $res->json('password');
        $id = $res->json('employee.id');

        // not in any other response
        foreach (['/api/employees', "/api/employees/{$id}", '/api/employees-summary'] as $url) {
            $body = $this->getJson($url)->getContent();
            $this->assertStringNotContainsString($password, $body, "{$url} must not contain the password");
            $this->assertStringNotContainsString('"password"', $body, "{$url} must not have a password field");
        }

        // not in the live feed that every page polls
        $this->assertSame(0, LiveEvent::where('message', 'like', '%'.$password.'%')->count());
        // the stored user row never has it in plain text
        $this->assertSame(0, User::where('password', $password)->count());
        // and nothing was emailed
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
    }

    public function test_a_guard_has_no_account_and_no_password(): void
    {
        $this->createEmployee(['position' => 'Guard', 'phone' => null])
            ->assertJsonPath('password', null)
            ->assertJsonPath('email', null);

        $this->assertSame(0, Employee::whereNotNull('user_id')->count());
    }

    public function test_the_password_is_not_written_to_the_log(): void
    {
        Log::spy();
        $password = $this->createEmployee()->json('password');

        Log::shouldNotHaveReceived('info', [\Mockery::on(fn ($m) => is_string($m) && str_contains($m, $password))]);
        Log::shouldNotHaveReceived('warning', [\Mockery::on(fn ($m) => is_string($m) && str_contains($m, $password))]);
        $this->assertTrue(true);
    }
}
